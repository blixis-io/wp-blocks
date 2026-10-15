#!/usr/bin/env node
// Local WordPress environment commands (BWB-012): up, install, down, reset, cli, logs, smoke.
// Wraps docker/compose.yml. Requires Docker. Configuration through environment variables:
//   BLX_WP_IMAGE, BLX_CLI_IMAGE, BLX_DB_IMAGE  override the pinned images
//   BLX_WP_PORT                                host port on 127.0.0.1 (default 8888)
//   BLX_EXPECT_WP, BLX_EXPECT_PHP              smoke test expectations (version prefixes)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditHtml } from '../a11y/audit-html.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = process.env.BLX_WP_PORT ?? '8888';
const base = `http://127.0.0.1:${port}`;
// The project name is passed explicitly and COMPOSE_PROJECT_NAME is ignored, so destructive commands such as
// `reset` can only ever touch this project's containers and volumes.
const PROJECT = 'blixis-wp-blocks';
const env = { ...process.env };
delete env.COMPOSE_PROJECT_NAME;
// compose.packages.yml mounts the packages that contain PHP code (theme, plugin, ...) into wp-content.
const hasPackages = existsSync(join(root, 'docker', 'compose.packages.yml'));
const files = ['compose.yml', ...(hasPackages ? ['compose.packages.yml'] : [])].flatMap((name) => [
  '-f',
  join(root, 'docker', name),
]);
const compose = (args, opts = {}) =>
  spawnSync('docker', ['compose', '-p', PROJECT, ...files, ...args], {
    cwd: root,
    stdio: 'inherit',
    env,
    ...opts,
  });
const capture = (args) => compose(args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const wp = (...args) => compose(['run', '--rm', '-T', 'cli', 'wp', ...args]);
const must = (r, what) => {
  if (r.status !== 0) {
    console.error(`${what} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
};

async function waitForHttp(url, seconds = 120) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (r.status >= 200 && r.status < 400) return; // WordPress answers (200, or a redirect to the installer)
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${url} did not become reachable within ${seconds}s`);
}

async function install() {
  await waitForHttp(`${base}/wp-login.php`);
  const installed = wp('core', 'is-installed');
  if (installed.status !== 0) {
    must(
      wp(
        'core',
        'install',
        `--url=${base}`,
        '--title=Blixis Dev',
        '--admin_user=admin',
        '--admin_password=password',
        '--admin_email=admin@example.test',
        '--skip-email',
      ),
      'wp core install',
    );
  }
  must(wp('language', 'core', 'install', 'nl_NL'), 'install nl_NL language pack');
  must(wp('eval-file', '/fixtures/seed.php'), 'seed fixtures');
  // Packages that are mounted into wp-content are activated here; the theme defines what the public pages look like.
  if (hasPackages) {
    must(
      wp('theme', 'is-installed', 'blixis'),
      'find the Blixis theme (the package mount in docker/compose.packages.yml did not work)',
    );
    must(wp('theme', 'activate', 'blixis'), 'activate the Blixis theme');
  }
  console.log(`\nWordPress is ready at ${base} (admin / password; development only, bound to localhost).`);
}

// Apache may close an idle keep-alive connection that undici is about to reuse ("other side closed"); one retry on a fresh
// connection is the standard remedy and never repeats a request that reached the server (the failure happens before it).
async function http(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return await fetch(url, options);
  }
}

async function smoke() {
  const failures = [];
  const check = (ok, message) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
    if (!ok) failures.push(message);
  };
  const get = async (path) => {
    const r = await http(base + path, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return { status: r.status, text: await r.text() };
  };

  const logSize = capture([
    'exec',
    '-T',
    'wordpress',
    'sh',
    '-c',
    'wc -c < /var/www/html/wp-content/debug.log 2>/dev/null || echo 0',
  ]);
  const logOffset = Number.parseInt(String(logSize.stdout ?? '0').trim(), 10) || 0;
  const home = await get('/');
  check(home.status === 200, 'front page returns 200');
  check(home.text.includes('Blixis fixture home'), 'front page shows the seeded home content');
  const about = await get('/about/');
  check(
    about.status === 200 && about.text.includes('Second sample page'),
    'pretty permalink /about/ serves the seeded page',
  );
  const rest = await get('/wp-json/');
  check(rest.status === 200 && rest.text.includes('"name":"Blixis Dev"'), 'REST API root responds with the site name');
  const login = await get('/wp-login.php');
  check(login.status === 200 && login.text.includes('loginform'), 'login page renders');
  const missing = await get('/definitely-not-a-page/');
  check(missing.status === 404, 'unknown URL returns 404');
  const pages = [
    ['front page', '/', home],
    ['about page', '/about/', about],
    ['single post', '/blixis-sample-post/', await get('/blixis-sample-post/')],
    ['search results', '/?s=Blixis', await get('/?s=Blixis')],
    ['404', '/definitely-not-a-page/', missing],
    ['category archive', '/category/blixis-news/', await get('/category/blixis-news/')],
    ['posts index', '/blog/', await get('/blog/')],
  ];
  for (const [name, , response] of pages) {
    check(response.status === (name === '404' ? 404 : 200), `${name} returns expected status`);
    for (const finding of auditHtml(response.text)) check(false, `${name}: ${finding.rule}: ${finding.message}`);
  }

  const out = (args) => {
    const r = capture(args);
    check(
      r.status === 0,
      `command succeeded: ${args.slice(args.indexOf('wp') >= 0 ? args.indexOf('wp') : 0).join(' ')}`,
    );
    return String(r.stdout ?? '').trim();
  };
  const wpVersion = out(['run', '--rm', '-T', 'cli', 'wp', 'core', 'version']);
  const phpVersion = out(['exec', '-T', 'wordpress', 'php', '-r', 'echo PHP_VERSION;']);
  console.log(`versions: WordPress ${wpVersion}, PHP ${phpVersion}`);
  // With the default pinned images the expected versions are the ADR 0001 floor; overrides must say what they expect.
  const defaults = process.env.BLX_WP_IMAGE === undefined;
  const expectWp = process.env.BLX_EXPECT_WP ?? (defaults ? '7.0' : undefined);
  const expectPhp = process.env.BLX_EXPECT_PHP ?? (defaults ? '8.2' : undefined);
  check(expectWp !== undefined, 'a WordPress version expectation is set (BLX_EXPECT_WP) when using non-default images');
  check(expectPhp !== undefined, 'a PHP version expectation is set (BLX_EXPECT_PHP) when using non-default images');
  if (expectWp) check(wpVersion.startsWith(expectWp), `WordPress version starts with ${expectWp}`);
  if (expectPhp) check(phpVersion.startsWith(expectPhp), `PHP version starts with ${expectPhp}`);

  // The Blixis theme (BWB-029): active, rendering through its templates, and declaring compatibility.
  const wpOut = (...args) => out(['run', '--rm', '-T', 'cli', 'wp', ...args]);
  // BWB-108: absent/invalid follows the system; explicit modes appear on html and in native controls.
  const appearanceBefore = capture(['run', '--rm', '-T', 'cli', 'wp', 'option', 'get', 'blixis_appearance']);
  const htmlTag = (page) => page.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const checkAppearance = async (value, expectedAttribute, expectedMeta) => {
    const page = (await get('/')).text;
    check(
      expectedAttribute
        ? htmlTag(page).includes(`data-theme="${expectedAttribute}"`)
        : !/\bdata-theme\s*=/.test(htmlTag(page)),
      `${value} site appearance has the expected html attribute`,
    );
    check(
      page.includes(`<meta name="color-scheme" content="${expectedMeta}">`),
      `${value} site appearance has the expected color-scheme meta tag`,
    );
    for (const finding of auditHtml(page)) check(false, `${value} appearance: ${finding.rule}: ${finding.message}`);
  };
  try {
    capture(['run', '--rm', '-T', 'cli', 'wp', 'option', 'delete', 'blixis_appearance']);
    await checkAppearance('default', null, 'light dark');
    for (const mode of ['dark', 'light']) {
      wpOut('option', 'update', 'blixis_appearance', mode);
      await checkAppearance(mode, mode, mode);
    }
    wpOut('option', 'update', 'blixis_appearance', 'invalid');
    await checkAppearance('invalid', null, 'light dark');
    check(
      !/<script\b/i.test(readFileSync(join(root, 'wordpress', 'theme', 'src', 'Appearance.php'), 'utf8')) &&
        !/<script\b/i.test(readFileSync(join(root, 'wordpress', 'theme', 'header.php'), 'utf8')),
      'theme appearance output and header add no inline script',
    );
  } finally {
    if (appearanceBefore.status === 0) {
      wpOut('option', 'update', 'blixis_appearance', String(appearanceBefore.stdout).trim());
    } else {
      capture(['run', '--rm', '-T', 'cli', 'wp', 'option', 'delete', 'blixis_appearance']);
    }
  }
  const localeBefore = wpOut('eval', "echo get_option( 'WPLANG' ) ?: 'en_US';");
  try {
    wpOut('language', 'core', 'install', 'ar');
    wpOut('site', 'switch-language', 'ar');
    for (const [name, path] of pages) {
      const response = await get(path);
      check(
        /<html\b[^>]*\blang=["']ar["']/.test(response.text) && /<html\b[^>]*\bdir=["']rtl["']/.test(response.text),
        `${name} has Arabic HTML language and RTL direction`,
      );
      check(/<body\b[^>]*\bclass=["'][^"']*\brtl\b/.test(response.text), `${name} has RTL body class`);
      for (const finding of auditHtml(response.text)) check(false, `${name} RTL: ${finding.rule}: ${finding.message}`);
    }
  } finally {
    wpOut('site', 'switch-language', localeBefore);
  }
  check(
    wpOut('theme', 'list', '--status=active', '--field=name').split('\n').includes('blixis'),
    'the Blixis theme is active',
  );
  check(wpOut('eval', 'echo \\Blixis\\Theme\\Compat::active();') === '1', 'the theme declares Blixis-Compat 1');
  check(
    home.text.includes('class="skip-link') && home.text.includes('<main id="content"'),
    'the front page has a skip link and a main landmark',
  );
  check(
    /<html [^>]*lang="[a-z]{2}/.test(home.text) && home.text.includes('name="viewport"'),
    'the front page declares language and viewport',
  );
  check(about.text.includes('entry-title'), 'a page renders through the theme page template');
  check(
    missing.text.includes('Page not found') && missing.text.includes('class="skip-link'),
    'the 404 page is rendered by the theme',
  );

  if (hasPackages) {
    const wpCmd = (...args) => capture(['run', '--rm', '-T', 'cli', 'wp', ...args]);
    const command = (...args) => {
      const result = wpCmd(...args);
      check(result.status === 0, `wp ${args.join(' ')} succeeds`);
      return String(result.stdout ?? '').trim();
    };
    // The Builder must be active for the REST, storage and lifecycle checks (a fresh stack starts without it).
    command('plugin', 'activate', 'blixis-builder');
    const inactive = command('theme', 'list', '--status=inactive', '--field=name').split('\n')[0];
    check(Boolean(inactive), 'an inactive theme is available for activation checks');
    if (inactive) {
      const previous = wpCmd('option', 'get', 'blixis_setup', '--format=json');
      command('theme', 'activate', inactive);
      wpCmd('option', 'delete', 'blixis_setup');
      command('theme', 'activate', 'blixis');
      const initial = command('option', 'get', 'blixis_setup', '--format=json');
      try {
        const state = JSON.parse(initial);
        check(state.version === 1 && state.status === 'not_started', 'first activation creates setup status');
        check(
          command('eval', "echo wp_load_alloptions()['blixis_setup'] ?? 'not-autoloaded';") === 'not-autoloaded',
          'setup option is not autoloaded',
        );
      } catch {
        check(false, 'first activation creates valid JSON setup status');
      }

      const loginAs = async (name) => {
        const loginPage = await http(`${base}/wp-login.php`, { redirect: 'manual' });
        let cookies = loginPage.headers.getSetCookie().map((value) => value.split(';')[0]);
        const response = await http(`${base}/wp-login.php`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            cookie: cookies.join('; '),
          },
          body: new URLSearchParams({
            log: name,
            pwd: 'password',
            'wp-submit': 'Log In',
            redirect_to: `${base}/wp-admin/themes.php`,
            testcookie: '1',
          }),
        });
        cookies = [...cookies, ...response.headers.getSetCookie().map((value) => value.split(';')[0])];
        check(response.status === 302, `${name} login redirects`);
        return cookies.join('; ');
      };
      const adminCookie = await loginAs('admin');
      const editorCookie = await loginAs('editor_ed');

      // Document REST API (BWB-041): authentication, nonce, role matrix, ETag and conflicts on real WordPress.
      {
        const restPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=draft',
          '--post_title=REST smoke',
          '--porcelain',
        );
        const nonceOf = async (cookie) =>
          (
            await (await http(`${base}/wp-admin/admin-ajax.php?action=rest-nonce`, { headers: { cookie } })).text()
          ).trim();
        const adminNonce = await nonceOf(adminCookie);
        const editorNonce = await nonceOf(editorCookie);
        const authorCookie = await loginAs('author_ann');
        const authorNonce = await nonceOf(authorCookie);
        const subscriberCookie = await loginAs('subscriber_sub');
        const subscriberNonce = await nonceOf(subscriberCookie);
        const wrap = async (response) => ({
          status: response.status,
          headers: response.headers,
          text: await response.text(),
        });
        const api = async (
          path,
          { cookie, nonce, method = 'GET', ifMatch, body, contentType = 'application/json' } = {},
        ) =>
          wrap(
            await http(`${base}/?rest_route=/blixis/v1/documents/${path}`, {
              method,
              headers: {
                ...(cookie ? { cookie } : {}),
                ...(nonce ? { 'x-wp-nonce': nonce } : {}),
                ...(ifMatch === undefined ? {} : { 'if-match': ifMatch }),
                ...(body === undefined ? {} : { 'content-type': contentType }),
              },
              body,
            }),
          );
        const json = async (response) => {
          try {
            return JSON.parse(response.text);
          } catch {
            return {};
          }
        };
        const doc = (note) => JSON.stringify({ schemaVersion: 1, layoutRevision: 1, note });
        const layout = `${restPost}/layout`;
        const anonymous = await api(layout);
        check(
          anonymous.status === 401 && (await json(anonymous)).code === 'blixis_unauthenticated',
          'an anonymous document read is 401',
        );
        const empty = await api(layout, { cookie: adminCookie, nonce: adminNonce });
        check(
          empty.status === 200 && (await json(empty)).revision === 0 && empty.headers.get('etag') === '"0"',
          'an empty stream reads as revision 0 with ETag "0"',
        );
        check((empty.headers.get('cache-control') ?? '').includes('no-store'), 'document responses are not cacheable');
        const noMatch = await api(layout, { cookie: adminCookie, nonce: adminNonce, method: 'PUT', body: doc('a') });
        check(noMatch.status === 428, 'a write without If-Match is 428');
        const badMatch = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: 'abc',
          body: doc('a'),
        });
        check(badMatch.status === 400, 'a malformed If-Match is 400');
        const noNonce = await api(layout, { cookie: adminCookie, method: 'PUT', ifMatch: '"0"', body: doc('a') });
        check(noNonce.status === 401, `a cookie write without a nonce is 401 and writes nothing (${noNonce.status})`);
        const badNonce = await api(layout, {
          cookie: adminCookie,
          nonce: 'deadbeef00',
          method: 'PUT',
          ifMatch: '"0"',
          body: doc('a'),
        });
        check(
          badNonce.status === 403 && (await json(badNonce)).code === 'rest_cookie_invalid_nonce',
          'a write with a bad nonce is 403 rest_cookie_invalid_nonce',
        );
        const written = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: doc('a'),
        });
        check(
          written.status === 200 && (await json(written)).revision === 1 && written.headers.get('etag') === '"1"',
          'a write with the current revision succeeds and returns ETag "1"',
        );
        const stale = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: doc('b'),
        });
        const staleBody = await json(stale);
        check(
          stale.status === 409 &&
            staleBody.code === 'blixis_conflict' &&
            staleBody.data?.currentRevision === 1 &&
            staleBody.data?.expectedRevision === 0,
          'a stale write is 409 with both revisions',
        );
        const read = await json(await api(layout, { cookie: adminCookie, nonce: adminNonce }));
        check(read.revision === 1 && read.document?.note === 'a', 'the document reads back what was written');
        const invalid = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"1"',
          body: '{"nope":true}',
        });
        check(
          invalid.status === 422 && (await json(invalid)).code === 'blixis_invalid_document',
          'an invalid envelope is 422',
        );
        const notJson = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"1"',
          body: 'x',
          contentType: 'text/plain',
        });
        check([415, 422, 400].includes(notJson.status), `a non-JSON body is rejected (${notJson.status})`);
        const big = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"1"',
          body: JSON.stringify({ schemaVersion: 1, layoutRevision: 1, pad: 'a'.repeat(2200000) }),
        });
        check(big.status === 413, 'a body over 2 MB is 413');
        const content = `${restPost}/content/nl_NL`;
        const nlWrite = await api(content, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: JSON.stringify({ schemaVersion: 1, contentRevision: 1 }),
        });
        check(nlWrite.status === 200, 'a locale content stream is written independently of the layout');
        check(
          (await json(await api(layout, { cookie: adminCookie, nonce: adminNonce }))).revision === 1,
          'writing a locale stream does not change the layout revision',
        );
        const badLocale = await api(`${restPost}/content/NL`, { cookie: adminCookie, nonce: adminNonce });
        check(
          badLocale.status === 400 && (await json(badLocale)).data?.details?.locale?.code === 'blixis_invalid_locale',
          'an invalid locale is 400',
        );
        const pointer = await api(`${restPost}/published`, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: '{}',
        });
        check(pointer.status === 404, 'the publication pointer has no document route');
        const editorWrite = await api(layout, {
          cookie: editorCookie,
          nonce: editorNonce,
          method: 'PUT',
          ifMatch: '"1"',
          body: doc('editor'),
        });
        check(editorWrite.status === 200, 'an editor may write another user page');
        const authorRead = await api(layout, { cookie: authorCookie, nonce: authorNonce });
        const subscriberRead = await api(layout, { cookie: subscriberCookie, nonce: subscriberNonce });
        const missingRead = await api('99999999/layout', { cookie: adminCookie, nonce: adminNonce });
        const forbidden = [authorRead, subscriberRead, missingRead];
        check(
          forbidden.every((r) => r.status === 403),
          'an author of another page, a subscriber and a missing post are all 403',
        );
        const codes = await Promise.all(forbidden.map(async (r) => (await json(r)).code));
        check(
          codes.every((c) => c === 'blixis_forbidden'),
          'the 403 responses are identical (no post existence probing)',
        );
        const authorWrite = await api(layout, {
          cookie: authorCookie,
          nonce: authorNonce,
          method: 'PUT',
          ifMatch: '"2"',
          body: doc('author'),
        });
        check(authorWrite.status === 403, 'an author cannot write another user page');
        // Preview API (BWB-042): working vs request source, auth, caps and no leaking of other posts or the published state.
        const previewUrl = (id) => `${base}/?rest_route=/blixis/v1/documents/${id}/preview`;
        const preview = async (id, { cookie, nonce, body, contentType = 'application/json' } = {}) =>
          wrap(
            await http(previewUrl(id), {
              method: 'POST',
              headers: {
                ...(cookie ? { cookie } : {}),
                ...(nonce ? { 'x-wp-nonce': nonce } : {}),
                'content-type': contentType,
              },
              body,
            }),
          );
        const node = (id, type, children = []) => ({ id, type, props: {}, children });
        const treeDoc = (children) => ({ schemaVersion: 1, layoutRevision: 1, root: children });
        const anonPreview = await preview(restPost, { body: '{}' });
        check(anonPreview.status === 401, 'an anonymous preview is 401');
        const sent = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({
            mode: 'dark',
            document: treeDoc([node('el-a1', 'blixis/section', [node('el-a2', 'blixis/heading')])]),
          }),
        });
        const sentBody = await json(sent);
        check(
          sent.status === 200 && sentBody.source === 'request' && sentBody.mode === 'dark',
          'a preview of a sent document is 200 and marked as request',
        );
        check(
          typeof sentBody.html === 'string' &&
            sentBody.html.includes('data-blx-id="el-a2"') &&
            !/<script|onerror=/i.test(sentBody.html),
          'preview HTML is a structural fragment without scripts',
        );
        check((sent.headers.get('cache-control') ?? '').includes('no-store'), 'preview responses are not cacheable');
        const currentLayout = await json(await api(layout, { cookie: adminCookie, nonce: adminNonce }));
        const saved = await api(layout, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: `"${currentLayout.revision}"`,
          body: JSON.stringify({ ...treeDoc([node('el-w1', 'blixis/section')]), note: 'working' }),
        });
        check(saved.status === 200, 'a layout with a tree can be saved for the working preview');
        // Real element output (BWB-043): semantics, escaping, translation fallback and unsafe URLs.
        const richDoc = {
          ...treeDoc([
            {
              id: 'sec1',
              type: 'blixis/section',
              props: { tag: 'main' },
              children: [
                { id: 'h1x', type: 'blixis/heading', props: { level: 2 }, children: [] },
                { id: 'b1x', type: 'blixis/button', props: { href: 'javascript:alert(1)' }, children: [] },
              ],
            },
          ]),
          defaultLocale: 'en_US',
          locales: ['en_US', 'nl_NL'],
          translations: {
            en_US: { h1x: { status: 'translated', values: { text: 'Hello <b>there</b> data: onclick=1' } } },
            nl_NL: {},
          },
        };
        const rich = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ locale: 'nl_NL', document: richDoc }),
        });
        const richBody = await json(rich);
        check(rich.status === 200, `a real document previews (${rich.status})`);
        check(
          /<main[^>]*data-blx-id="sec1"/.test(richBody.html ?? '') &&
            /<h2[^>]*data-blx-id="h1x"/.test(richBody.html ?? ''),
          'sections and headings render with their semantic tags',
        );
        check(
          (richBody.html ?? '').includes('Hello &lt;b&gt;there&lt;/b&gt;') &&
            !(richBody.html ?? '').includes('<b>there'),
          'translated text is escaped and falls back to the default locale',
        );
        check(!/javascript:/i.test(richBody.html ?? ''), 'an unsafe button URL never reaches the output');
        const working = await preview(restPost, { cookie: adminCookie, nonce: adminNonce, body: '{}' });
        const workingBody = await json(working);
        check(
          working.status === 200 && workingBody.source === 'working',
          'a preview without a document uses the working layout',
        );
        const hostile = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ document: treeDoc([node('x" onmouseover="alert(1)', '<script>alert(1)</script>')]) }),
        });
        const hostileBody = await json(hostile);
        check(
          hostile.status === 200 && !/<script|onmouseover=/i.test(hostileBody.html ?? ''),
          'hostile ids and types never reach the preview HTML as markup',
        );
        const dup = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ document: treeDoc([node('d', 't'), node('d', 't')]) }),
        });
        check(dup.status === 422, 'duplicate element ids are 422');
        let deep = node('n0', 't');
        for (let i = 1; i < 40; i += 1) deep = node(`n${i}`, 't', [deep]);
        const tooDeep = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ document: treeDoc([deep]) }),
        });
        check(tooDeep.status === 422, 'a tree deeper than 32 is 422');
        const badMode = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ mode: 'sepia' }),
        });
        check(badMode.status === 400, 'an unknown mode is 400');
        const badPreviewLocale = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ locale: 'nl;x' }),
        });
        check(badPreviewLocale.status === 400, 'an invalid locale is 400');
        const bigPreview = await preview(restPost, {
          cookie: adminCookie,
          nonce: adminNonce,
          body: JSON.stringify({ document: { schemaVersion: 1, layoutRevision: 1, pad: 'a'.repeat(2200000) } }),
        });
        check(bigPreview.status === 413, 'an oversized preview body is 413');
        const previewForbidden = await Promise.all([
          preview(restPost, { cookie: subscriberCookie, nonce: subscriberNonce, body: '{}' }),
          preview(restPost, { cookie: authorCookie, nonce: authorNonce, body: '{}' }),
          preview('99999999', { cookie: adminCookie, nonce: adminNonce, body: '{}' }),
        ]);
        check(
          previewForbidden.every((r) => r.status === 403),
          'preview is 403 for a subscriber, an author of another page and a missing post',
        );
        command(
          'eval',
          `update_post_meta( ${restPost}, '_blixis_published', '{"schemaVersion":1,"pointerRevision":1,"publishedLayoutRevision":7}' );`,
        );
        const afterPointer = await preview(restPost, { cookie: adminCookie, nonce: adminNonce, body: '{}' });
        check(afterPointer.status === 200, 'a pointer to a missing snapshot does not affect the editor preview');
        // Frontend (BWB-044): only the published snapshots render, drafts never leak, caches follow the revisions.
        const pageId = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=publish',
          '--post_title=Front smoke',
          '--post_content=PLAIN CONTENT',
          '--porcelain',
        );
        const front = async () => (await get(`/?page_id=${pageId}`)).text;
        const frontStep = (step) => command('eval-file', '/fixtures/frontend-smoke.php', pageId, step);
        frontStep('working');
        let html = await front();
        check(
          html.includes('PLAIN CONTENT') && !html.includes('data-blx-document'),
          'a page without a publication pointer shows its normal content',
        );
        check(!html.includes('DRAFT-SECRET'), 'working (draft) streams never reach visitors');
        check(frontStep('publish1') === 'published', 'the first publication is written');
        html = await front();
        check(
          html.includes('data-blx-document') && html.includes('data-blx-id="el-001"') && html.includes('Published one'),
          'a published page renders its snapshot',
        );
        const elementClass = /data-blx-id="el-001"[^>]*class="(blx-[0-9a-f]{12})"/.exec(html)?.[1];
        check(
          elementClass !== undefined && html.includes(`.${elementClass}{color:red}`),
          'the element carries the generated class that the printed stylesheet targets',
        );
        check(
          !html.includes('PLAIN CONTENT') && !html.includes('DRAFT-SECRET'),
          'the published output replaces the post content and ignores drafts',
        );
        check(
          /<style[^>]*id=['"]blixis-builder-frontend-inline-css['"][^>]*>[^<]*\/\*blx-css:1\*\/[^<]*color:red/.test(
            html,
          ),
          'compiled CSS is printed once as an inline style',
        );
        check(
          command('option', 'list', '--transients', '--search=_transient_blx_*', '--field=option_name').length > 0,
          'the rendered page is cached',
        );
        const epochBefore = command('eval', "echo get_option( 'blixis_builder_epoch', '' );");
        check(frontStep('publish2') === 'published', 'a second publication advances the pointer');
        html = await front();
        check(
          html.includes('Published two') && !html.includes('Published one') && html.includes('color:blue'),
          'a new revision shows new content and CSS without any manual cache flush',
        );
        command('eval', "update_option( 'blixis_design_system', array( 'tokenVersion' => 99 ), true );");
        const epochAfter = command('eval', "echo get_option( 'blixis_builder_epoch', '' );");
        check(
          epochBefore !== '' && epochAfter !== '' && epochAfter !== epochBefore,
          'changing the design system starts a new cache epoch',
        );
        command('option', 'delete', 'blixis_design_system');
        check(frontStep('break') === 'broken', 'the published layout snapshot can be removed for the failure case');
        html = await front();
        check(
          html.includes('PLAIN CONTENT') && !html.includes('data-blx-document'),
          'a broken publication falls back to the normal post content',
        );
        command('post', 'delete', pageId, '--force');
        // Revision ring (BWB-046): history of working streams, bounded, restore as a new revision, conflicts.
        const histPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=draft',
          '--post_title=History',
          '--porcelain',
        );
        const histLayout = `${histPost}/layout`;
        const save = (note, expected) =>
          api(histLayout, {
            cookie: adminCookie,
            nonce: adminNonce,
            method: 'PUT',
            ifMatch: `"${expected}"`,
            body: JSON.stringify({ schemaVersion: 1, layoutRevision: 1, note }),
          });
        check((await save('A', 0)).status === 200, 'the first save creates revision 1');
        check(
          (await save('B', 1)).status === 200 && (await save('C', 2)).status === 200,
          'later saves advance the revision',
        );
        const history = await json(await api(`${histLayout}/revisions`, { cookie: adminCookie, nonce: adminNonce }));
        check(
          history.current === 3 && history.revisions?.map((r) => r.revision).join() === '2,1',
          'the history lists the replaced revisions, newest first',
        );
        check(
          history.revisions?.every((r) => typeof r.author === 'number' && /^\d{4}-\d\d-\d\dT/.test(r.savedAt)),
          'each history entry records who saved and when',
        );
        const restoreWith = (revision, expected) =>
          api(`${histLayout}/restore`, {
            cookie: adminCookie,
            nonce: adminNonce,
            method: 'POST',
            ...(expected === null ? {} : { ifMatch: `"${expected}"` }),
            body: JSON.stringify({ revision }),
          });
        check((await restoreWith(1, null)).status === 428, 'a restore without If-Match is 428');
        check((await restoreWith(99, 3)).status === 404, 'restoring an unknown revision is 404');
        const staleRestore = await restoreWith(1, 2);
        check(
          staleRestore.status === 409 && (await json(staleRestore)).data?.currentRevision === 3,
          'a stale restore is a 409 conflict',
        );
        const restoredResult = await restoreWith(1, 3);
        check(
          restoredResult.status === 200 && (await json(restoredResult)).revision === 4,
          'restoring creates a new revision (append-only)',
        );
        check(
          (await json(await api(histLayout, { cookie: adminCookie, nonce: adminNonce }))).document?.note === 'A',
          'the restored content is what was saved as revision 1',
        );
        const afterRestore = await json(
          await api(`${histLayout}/revisions`, { cookie: adminCookie, nonce: adminNonce }),
        );
        check(afterRestore.revisions?.[0]?.revision === 3, 'the content that was restored over stays recoverable');
        let expectedRevision = 4;
        for (let i = 0; i < 23; i += 1) {
          const saved = await save(`bulk-${i}`, expectedRevision);
          if (saved.status !== 200) break;
          expectedRevision += 1;
        }
        const bounded = await json(await api(`${histLayout}/revisions`, { cookie: adminCookie, nonce: adminNonce }));
        check(
          bounded.revisions?.length === 20 && bounded.current === 27,
          'the history keeps only the newest 20 revisions',
        );
        check(
          (await api(`${histLayout}/revisions`, { cookie: subscriberCookie, nonce: subscriberNonce })).status === 403 &&
            (await api(`${histLayout}/revisions`)).status === 401,
          'history needs the same access as the document (401 anonymous, 403 without edit rights)',
        );
        const nlPath = `${histPost}/content/nl_NL`;
        await api(nlPath, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: JSON.stringify({ schemaVersion: 1, contentRevision: 1 }),
        });
        await api(nlPath, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"1"',
          body: JSON.stringify({ schemaVersion: 1, contentRevision: 1 }),
        });
        const nlHistory = await json(await api(`${nlPath}/revisions`, { cookie: adminCookie, nonce: adminNonce }));
        check(nlHistory.current === 2 && nlHistory.revisions?.length === 1, 'a locale stream has its own history');
        command('post', 'delete', histPost, '--force');
        // Publication (BWB-046): one pointer, separate layout and locale publishing, impact reports, rollback, capability split.
        const contributorId = command('user', 'get', 'contributor_con', '--field=ID');
        const pubPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=publish',
          '--post_title=Publish smoke',
          '--post_content=PLAIN PUBLISH',
          '--porcelain',
        );
        const draftOfContributor = command(
          'post',
          'create',
          '--post_type=post',
          '--post_status=draft',
          '--post_title=Contributor draft',
          `--post_author=${contributorId}`,
          '--porcelain',
        );
        const contributorCookie = await loginAs('contributor_con');
        const contributorNonce = await nonceOf(contributorCookie);
        const heading = (id) => ({ id, type: 'blixis/heading', props: {}, children: [] });
        const layoutBody = (ids) =>
          JSON.stringify({ schemaVersion: 1, documentId: 'doc-pub', layoutRevision: 1, root: ids.map(heading) });
        const contentBody = (texts) =>
          JSON.stringify({
            schemaVersion: 1,
            contentRevision: 1,
            entries: Object.fromEntries(
              Object.entries(texts).map(([id, text]) => [id, { status: 'translated', values: { text } }]),
            ),
          });
        const putStream = (post, path, body, expected) =>
          api(`${post}/${path}`, {
            cookie: adminCookie,
            nonce: adminNonce,
            method: 'PUT',
            ifMatch: `"${expected}"`,
            body,
          });
        const postAction = (post, action, payload, expected, who = { cookie: adminCookie, nonce: adminNonce }) =>
          api(`${post}/${action}`, { ...who, method: 'POST', ifMatch: `"${expected}"`, body: JSON.stringify(payload) });
        const pubState = async (post = pubPost) =>
          json(await api(`${post}/published`, { cookie: adminCookie, nonce: adminNonce }));
        const pubPage = async () => (await get(`/?page_id=${pubPost}`)).text;

        await putStream(pubPost, 'layout', layoutBody(['hed-1', 'hed-2']), 0);
        await putStream(pubPost, 'content/en_US', contentBody({ 'hed-1': 'Hello live' }), 0);
        await putStream(pubPost, 'content/nl_NL', contentBody({ 'hed-2': 'Tweede kop' }), 0);
        check(
          (await pubState()).layout?.state === 'unpublished' && (await pubPage()).includes('PLAIN PUBLISH'),
          'saved working data is not live and the state is unpublished',
        );
        check(
          (
            await postAction(pubPost, 'publish', { layout: true, locale: 'en_US' }, 0, {
              cookie: subscriberCookie,
              nonce: subscriberNonce,
            })
          ).status === 403,
          'a subscriber cannot publish',
        );
        await putStream(draftOfContributor, 'layout', layoutBody(['hed-1']), 0);
        const contributorRead = await api(`${draftOfContributor}/published`, {
          cookie: contributorCookie,
          nonce: contributorNonce,
        });
        const contributorPublish = await postAction(draftOfContributor, 'publish', { layout: true }, 0, {
          cookie: contributorCookie,
          nonce: contributorNonce,
        });
        check(
          contributorRead.status === 200 && contributorPublish.status === 403,
          'someone who may edit but not publish can read the state and cannot publish',
        );
        check(
          (await postAction(pubPost, 'publish', { layout: true, locale: 'en_US' }, 3)).status === 409,
          'publishing with a stale pointer revision is a conflict',
        );
        const first = await postAction(pubPost, 'publish', { layout: true, locale: 'en_US' }, 0);
        const firstBody = await json(first);
        check(
          first.status === 200 && firstBody.pointerRevision === 1 && first.headers.get('etag') === '"1"',
          'the first publication advances the pointer to revision 1',
        );
        let pubHtml = await pubPage();
        check(
          pubHtml.includes('Hello live') &&
            pubHtml.includes('data-blx-id="hed-2"') &&
            !pubHtml.includes('PLAIN PUBLISH'),
          'the published layout and English content are live',
        );
        const afterFirst = await pubState();
        check(
          afterFirst.layout?.state === 'published' && afterFirst.locales?.en_US?.state === 'published',
          'the state reports published',
        );
        await putStream(pubPost, 'content/en_US', contentBody({ 'hed-1': 'Hello EDITED' }), 1);
        pubHtml = await pubPage();
        check(pubHtml.includes('Hello live') && !pubHtml.includes('EDITED'), 'autosaved changes never reach visitors');
        check(
          (await pubState()).locales?.en_US?.state === 'published-with-pending-changes',
          'the state reports pending changes',
        );
        const dutch = await postAction(pubPost, 'publish', { locale: 'nl_NL' }, 1);
        check(dutch.status === 200, 'publishing Dutch only moves the Dutch content');
        check((await pubPage()).includes('Hello live'), 'publishing Dutch leaves the live English page unchanged');
        await putStream(pubPost, 'layout', layoutBody(['hed-1']), 1);
        const blocked = await postAction(pubPost, 'publish', { layout: true }, 2);
        const blockedBody = await json(blocked);
        check(
          blocked.status === 409 &&
            blockedBody.code === 'blixis_publish_blocked' &&
            blockedBody.data?.impacted?.[0]?.locale === 'nl_NL',
          'a layout change that breaks a published locale is blocked with an impact report',
        );
        check((await pubState()).pointerRevision === 2, 'a blocked publish changes nothing');
        const confirmed = await postAction(pubPost, 'publish', { layout: true, confirmImpact: true }, 2);
        check(
          confirmed.status === 200 && (await json(confirmed)).pinnedLocales?.join() === 'nl_NL',
          'with confirmation the broken locale stays pinned to its previous layout',
        );
        pubHtml = await pubPage();
        check(
          pubHtml.includes('Hello live') && !pubHtml.includes('data-blx-id="hed-2"'),
          'the compatible locale uses the new layout immediately',
        );
        const back = await postAction(pubPost, 'rollback', { locale: 'en_US', contentSnapshot: 1 }, 3);
        const backBody = await json(back);
        check(
          back.status === 200 && backBody.contentSnapshot === 2 && backBody.pointerRevision === 4,
          'a locale rollback republishes the old snapshot under a new number',
        );
        check(
          (await postAction(pubPost, 'rollback', { locale: 'en_US', contentSnapshot: 99 }, 4)).status === 404,
          'rolling back to an unknown snapshot is 404',
        );
        pubHtml = await pubPage();
        check(
          pubHtml.includes('data-blx-id="hed-2"'),
          'the locale rollback restores the layout the content was published against',
        );
        command('post', 'delete', pubPost, '--force');
        command('post', 'delete', draftOfContributor, '--force');
        // Theme compatibility guard (BWB-047): lock editing on unsupported themes, keep data and public output, restore on switch back.
        const guardPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=publish',
          '--post_title=Guard smoke',
          '--post_content=PLAIN GUARD',
          '--porcelain',
        );
        const guardLayout = JSON.stringify({
          schemaVersion: 1,
          documentId: 'doc-grd',
          layoutRevision: 1,
          root: [{ id: 'hed-1', type: 'blixis/heading', props: {}, children: [] }],
        });
        const guardContent = JSON.stringify({
          schemaVersion: 1,
          contentRevision: 1,
          entries: { 'hed-1': { status: 'translated', values: { text: 'Guard live text' } } },
        });
        const guardPut = (path, body, expected) =>
          api(`${guardPost}/${path}`, {
            cookie: adminCookie,
            nonce: adminNonce,
            method: 'PUT',
            ifMatch: `"${expected}"`,
            body,
          });
        const guardPost2 = (action, payload, expected, who = { cookie: adminCookie, nonce: adminNonce }) =>
          api(`${guardPost}/${action}`, {
            ...who,
            method: 'POST',
            ifMatch: `"${expected}"`,
            body: JSON.stringify(payload),
          });
        const statusOf = async () =>
          json(
            await wrap(
              await http(`${base}/?rest_route=/blixis/v1/status`, {
                headers: { cookie: adminCookie, 'x-wp-nonce': adminNonce },
              }),
            ),
          );
        const guardPage = async () => (await get(`/?page_id=${guardPost}`)).text;
        check(
          (await guardPut('layout', guardLayout, 0)).status === 200 &&
            (await guardPut('content/en_US', guardContent, 0)).status === 200,
          'working data is saved on the compatible theme',
        );
        check(
          (await guardPost2('publish', { layout: true, locale: 'en_US' }, 0)).status === 200,
          'a page is published on the compatible theme',
        );
        let status = await statusOf();
        check(
          status.theme?.compatible === true && status.editing?.enabled === true && status.theme?.reason === 'ok',
          'the status route reports a compatible theme with editing enabled',
        );
        check(
          !(await guardPage()).includes('blixis-builder-fallback'),
          'a compatible theme gets no fallback stylesheet',
        );
        command('theme', 'activate', 'blixis-other-fixture');
        status = await statusOf();
        check(
          status.theme?.compatible === false &&
            status.theme?.reason === 'not-declared' &&
            status.editing?.enabled === false &&
            status.theme?.name === 'Blixis Other Fixture',
          'an unrelated theme is reported as not compatible and editing is disabled',
        );
        const locked = await guardPut('layout', guardLayout, 1);
        const lockedBody = await json(locked);
        check(
          locked.status === 423 &&
            lockedBody.code === 'blixis_theme_incompatible' &&
            lockedBody.data?.reason === 'not-declared' &&
            lockedBody.data?.supportedMin === 1,
          'saving is locked with 423 and the reason',
        );
        check((await guardPut('content/en_US', guardContent, 1)).status === 423, 'saving content is locked');
        check((await guardPost2('publish', { layout: true }, 1)).status === 423, 'publishing is locked');
        check((await guardPost2('rollback', { layoutSnapshot: 1 }, 1)).status === 423, 'rollback is locked');
        check((await guardPost2('layout/restore', { revision: 1 }, 1)).status === 423, 'restore is locked');
        check(
          (await guardPost2('content/en_US/restore', { revision: 1 }, 1)).status === 423,
          'restoring content is locked',
        );
        check(
          (await api(`${guardPost}/publish`, { method: 'POST', ifMatch: '"1"', body: '{}' })).status === 401 &&
            (await guardPost2('publish', { layout: true }, 1, { cookie: subscriberCookie, nonce: subscriberNonce }))
              .status === 403,
          'access checks come before the lock for publishing too: anonymous 401, no rights 403',
        );
        check(
          (await guardPut('layout', guardLayout, 1)).status === 423 &&
            (
              await api(`${guardPost}/layout`, {
                cookie: subscriberCookie,
                nonce: subscriberNonce,
                method: 'PUT',
                ifMatch: '"1"',
                body: guardLayout,
              })
            ).status === 403,
          'access checks come first: a subscriber still gets 403, not 423',
        );
        const keptLayout = await json(await api(`${guardPost}/layout`, { cookie: adminCookie, nonce: adminNonce }));
        check(
          keptLayout.revision === 1 && keptLayout.document?.root?.[0]?.id === 'hed-1',
          'the saved data is untouched and readable',
        );
        check(
          (await api(`${guardPost}/layout/revisions`, { cookie: adminCookie, nonce: adminNonce })).status === 200 &&
            (await api(`${guardPost}/published`, { cookie: adminCookie, nonce: adminNonce })).status === 200,
          'history and publication state stay readable',
        );
        check(
          (await preview(guardPost, { cookie: adminCookie, nonce: adminNonce, body: '{}' })).status === 200,
          'preview stays available',
        );
        const lockedPage = await guardPage();
        check(
          lockedPage.includes('Guard live text') &&
            lockedPage.includes('blixis-builder-fallback') &&
            !lockedPage.includes('PLAIN GUARD'),
          'the published page still renders and gets the fallback stylesheet',
        );
        const dashboard = await http(`${base}/wp-admin/index.php`, { headers: { cookie: adminCookie } });
        check(
          (await dashboard.text()).includes('Blixis Other Fixture'),
          'the admin shows a notice naming the incompatible theme',
        );
        command('theme', 'activate', 'blixis-child-invalid-fixture');
        check(
          (await statusOf()).theme?.reason === 'invalid-declaration',
          'an invalid declaration in a child theme is incompatible and does not fall through to the parent',
        );
        command('theme', 'activate', 'blixis-child-fixture');
        check(
          (await statusOf()).theme?.compatible === true,
          'a child of the Blixis theme is compatible through its parent',
        );
        command('theme', 'activate', 'blixis');
        status = await statusOf();
        check(status.editing?.enabled === true, 'switching back to a compatible theme re-enables editing');
        check(
          (await guardPut('layout', guardLayout, 1)).status === 200,
          'saving works again straight after switching back',
        );
        check(
          !(await guardPage()).includes('blixis-builder-fallback'),
          'the fallback stylesheet is gone on the compatible theme',
        );
        command('post', 'delete', guardPost, '--force');
        // Hardening (BWB-048): audit event, per-user publish rate limit, snapshot cap, hostile payloads.
        const auditPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=draft',
          '--post_title=Audit smoke',
          '--porcelain',
        );
        const audit = JSON.parse(command('eval-file', '/fixtures/audit-smoke.php', auditPost).split('\n').pop());
        const auditEvent = audit.events?.[0] ?? {};
        check(
          audit.saved === 200 && audit.status === 200 && audit.events?.length === 1,
          'publishing fires exactly one audit event',
        );
        check(
          auditEvent.kind === 'publish' &&
            auditEvent.actor === 1 &&
            auditEvent.post === Number(auditPost) &&
            auditEvent.layoutSnapshot === 1 &&
            auditEvent.pointerRevision === 1 &&
            /^\d{4}-\d\d-\d\dT[\d:]+Z$/.test(auditEvent.time ?? ''),
          'the audit event records actor, post, kind, snapshot, pointer revision and UTC time',
        );
        check(!JSON.stringify(auditEvent).includes('hed-1'), 'the audit event carries no document content');
        command('post', 'delete', auditPost, '--force');

        const limitPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=draft',
          '--post_title=Limit smoke',
          '--porcelain',
        );
        await api(`${limitPost}/layout`, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: JSON.stringify({
            schemaVersion: 1,
            documentId: 'doc-lim',
            layoutRevision: 1,
            root: [{ id: 'hed-1', type: 'blixis/heading', props: {}, children: [] }],
          }),
        });
        let firstLimited = 0;
        let retryAfter = null;
        for (let attempt = 1; attempt <= 33 && firstLimited === 0; attempt += 1) {
          const response = await api(`${limitPost}/publish`, {
            cookie: adminCookie,
            nonce: adminNonce,
            method: 'POST',
            ifMatch: `"${attempt - 1}"`,
            body: JSON.stringify({ layout: true }),
          });
          if (response.status === 429) {
            firstLimited = attempt;
            retryAfter = response.headers.get('retry-after');
            check((await json(response)).code === 'blixis_rate_limited', 'the rate limit has a stable error code');
          } else if (response.status !== 200) {
            check(false, `publish attempt ${attempt} returned ${response.status}`);
            break;
          }
        }
        check(firstLimited === 31, `the 31st publish of a post within an hour is refused with 429 (${firstLimited})`);
        check(Number(retryAfter) >= 1, 'the 429 carries a Retry-After header');
        command('post', 'delete', limitPost, '--force');

        const capPost = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=draft',
          '--post_title=Cap smoke',
          '--porcelain',
        );
        await api(`${capPost}/layout`, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'PUT',
          ifMatch: '"0"',
          body: JSON.stringify({
            schemaVersion: 1,
            documentId: 'doc-cap',
            layoutRevision: 1,
            root: [{ id: 'hed-1', type: 'blixis/heading', props: {}, children: [] }],
          }),
        });
        command(
          'eval',
          `global $wpdb; $db = new Blixis\\Builder\\Storage\\WpdbDatabase( $wpdb ); for ( $i = 1; $i <= 200; $i++ ) { $db->insert( ${capPost}, Blixis\\Builder\\Storage\\MetaKeys::snap_layout( 5000 + $i ), '{"schemaVersion":1,"layoutRevision":1}' ); }`,
        );
        const capped = await api(`${capPost}/publish`, {
          cookie: adminCookie,
          nonce: adminNonce,
          method: 'POST',
          ifMatch: '"0"',
          body: JSON.stringify({ layout: true }),
        });
        check(
          capped.status === 409 && (await json(capped)).code === 'blixis_snapshot_limit',
          'a post that already holds 200 snapshots cannot publish more',
        );
        command('post', 'delete', capPost, '--force');

        const hostileBodies = [
          ['a very deep JSON body', '['.repeat(5000) + ']'.repeat(5000)],
          [
            'invalid UTF-8',
            Buffer.concat([
              Buffer.from('{"schemaVersion":1,"layoutRevision":1,"x":"'),
              Buffer.from([0xff, 0xfe]),
              Buffer.from('"}'),
            ]),
          ],
          ['a body of NUL bytes', '\u0000'.repeat(100)],
        ];
        const hostileTarget = command(
          'post',
          'create',
          '--post_type=page',
          '--post_status=draft',
          '--post_title=Hostile smoke',
          '--porcelain',
        );
        for (const [label, body] of hostileBodies) {
          const response = await api(`${hostileTarget}/layout`, {
            cookie: adminCookie,
            nonce: adminNonce,
            method: 'PUT',
            ifMatch: '"0"',
            body,
          });
          check(
            [400, 413, 422].includes(response.status) && !/\/var\/www|Stack trace|wpdb|\.php/.test(response.text),
            `${label} is rejected with a client error and no internals (${response.status})`,
          );
        }
        const unchanged = await json(await api(`${hostileTarget}/layout`, { cookie: adminCookie, nonce: adminNonce }));
        check(unchanged.revision === 0, 'hostile bodies never change stored data');
        command('post', 'delete', hostileTarget, '--force');
        // Media (BWB-045): raster library images only, validated responsive attributes, alt text, picker route.
        const mediaIds = JSON.parse(command('eval-file', '/fixtures/media-smoke.php').split('\n').pop());
        const mediaApi = async (id, { cookie, nonce } = {}) =>
          wrap(
            await http(`${base}/?rest_route=/blixis/v1/media/${id}`, {
              headers: { ...(cookie ? { cookie } : {}), ...(nonce ? { 'x-wp-nonce': nonce } : {}) },
            }),
          );
        const picked = await mediaApi(mediaIds.raster, { cookie: adminCookie, nonce: adminNonce });
        const pickedBody = await json(picked);
        check(
          picked.status === 200 &&
            pickedBody.id === mediaIds.raster &&
            pickedBody.width === 1200 &&
            pickedBody.alt === 'Smoke alt' &&
            /\d+w/.test(pickedBody.srcset ?? '') &&
            typeof pickedBody.sizes === 'string',
          'the media route describes a library image with alt text, srcset and sizes',
        );
        check((picked.headers.get('cache-control') ?? '').includes('no-store'), 'media descriptions are not cacheable');
        check(
          (await mediaApi(mediaIds.svg, { cookie: adminCookie, nonce: adminNonce })).status === 404,
          'an SVG attachment is not served by the builder',
        );
        check(
          (await mediaApi('99999999', { cookie: adminCookie, nonce: adminNonce })).status === 404,
          'a missing attachment is 404',
        );
        check((await mediaApi(mediaIds.raster)).status === 401, 'the media route needs authentication');
        check(
          (await mediaApi(mediaIds.raster, { cookie: subscriberCookie, nonce: subscriberNonce })).status === 403,
          'a subscriber cannot use the media route',
        );
        const imageDoc = (attachmentId) => ({
          ...treeDoc([
            {
              id: 'sec1',
              type: 'blixis/section',
              props: { tag: 'section' },
              children: [{ id: 'img1', type: 'blixis/image', props: { attachmentId }, children: [] }],
            },
          ]),
          defaultLocale: 'en_US',
          locales: ['en_US'],
          translations: { en_US: {} },
        });
        const imagePreview = async (attachmentId) =>
          json(
            await preview(restPost, {
              cookie: adminCookie,
              nonce: adminNonce,
              body: JSON.stringify({ document: imageDoc(attachmentId) }),
            }),
          );
        const rasterHtml = (await imagePreview(mediaIds.raster)).html ?? '';
        check(
          /<img[^>]*srcset="[^"]*\d+w[^"]*"[^>]*sizes="[^"]+"[^>]*alt="Smoke alt"/.test(rasterHtml),
          'a library image renders with srcset, sizes and its alt text',
        );
        check(!/data-blx-alt-missing/.test(rasterHtml), 'an image with alt text is not flagged');
        const svgHtml = (await imagePreview(mediaIds.svg)).html ?? '';
        check(
          svgHtml.includes('data-blx-missing-media') && !svgHtml.includes('<img'),
          'an SVG attachment renders the inert placeholder',
        );
        command(
          'eval',
          `wp_delete_attachment( ${mediaIds.raster}, true ); wp_delete_attachment( ${mediaIds.svg}, true );`,
        );
        command('post', 'delete', restPost, '--force');
      }
      const adminThemes = await http(`${base}/wp-admin/themes.php`, {
        headers: { cookie: adminCookie },
      });
      const editorThemes = await http(`${base}/wp-admin/themes.php`, {
        headers: { cookie: editorCookie },
      });
      const adminHtml = await adminThemes.text();
      check(adminHtml.includes('Set up the Blixis theme when you are ready.'), 'admin sees the setup notice');
      check(
        !(await editorThemes.text()).includes('Set up the Blixis theme when you are ready.'),
        'editor does not see the setup notice',
      );
      check(
        command('eval', "echo user_can(get_user_by('login', 'editor_ed'), 'edit_theme_options') ? 'yes' : 'no';") ===
          'no',
        'editor lacks edit_theme_options',
      );
      for (const [name, cookie] of [
        ['admin', adminCookie],
        ['editor_ed', editorCookie],
      ]) {
        const response = await http(`${base}/wp-admin/admin-post.php`, {
          method: 'POST',
          redirect: 'manual',
          headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
          body: 'action=blixis_setup_dismiss',
        });
        check(response.status === 403, `${name} cannot dismiss without a nonce`);
        const getResponse = await http(`${base}/wp-admin/admin-post.php?action=blixis_setup_start`, {
          redirect: 'manual',
          headers: { cookie },
        });
        check(getResponse.status === 403, `${name} cannot start via GET`);
      }
      const afterDenied = JSON.parse(command('option', 'get', 'blixis_setup', '--format=json'));
      check(afterDenied.status === 'not_started', 'rejected requests preserve setup status');
      for (const action of ['start', 'dismiss']) {
        const nonce = adminHtml.match(new RegExp(`name="blixis_setup_nonce_${action}" value="([a-z0-9]+)"`))?.[1];
        check(Boolean(nonce), `${action} form has a nonce`);
        if (nonce) {
          const response = await http(`${base}/wp-admin/admin-post.php`, {
            method: 'POST',
            redirect: 'manual',
            headers: { cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ action: `blixis_setup_${action}`, [`blixis_setup_nonce_${action}`]: nonce }),
          });
          check(response.status === 302, `${action} redirects after an authorized POST`);
          const state = JSON.parse(command('option', 'get', 'blixis_setup', '--format=json'));
          check(state.status === (action === 'start' ? 'in_progress' : 'dismissed'), `${action} updates site status`);
          if (action === 'start') {
            const wizardUrl = `${base}/wp-admin/themes.php?page=blixis-setup`;
            const editorWizard = await http(wizardUrl, { headers: { cookie: editorCookie }, redirect: 'manual' });
            check(editorWizard.status === 403, 'editor cannot open setup wizard');
            const stepPage = async (step) => {
              const response = await http(`${wizardUrl}&step=${step}`, { headers: { cookie: adminCookie } });
              const html = await response.text();
              check(
                response.status === 200 &&
                  html.includes(
                    `<h2>${['', 'Choose preset', 'Colors', 'Typography', 'Spacing, radius and layout', 'Preview', 'Apply'][step]}</h2>`,
                  ),
                `wizard step ${step} renders`,
              );
              return html;
            };
            const submit = async (step, html, fields, direction = 'next') => {
              const nonce = html.match(/name="blixis_setup_nonce_wizard" value="([a-z0-9]+)"/)?.[1];
              check(Boolean(nonce), `wizard step ${step} has a nonce`);
              return http(`${base}/wp-admin/admin-post.php`, {
                method: 'POST',
                redirect: 'manual',
                headers: { cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  action: 'blixis_setup_wizard',
                  step: String(step),
                  direction,
                  blixis_setup_nonce_wizard: nonce ?? '',
                  ...fields,
                }),
              });
            };
            let html = await stepPage(1);
            let response = await submit(1, html, { preset: 'ocean' });
            check(response.status === 302, 'preset POST advances');
            html = await stepPage(2);
            const draftBefore = command('user', 'meta', 'get', 'admin', 'blixis_setup_draft');
            check(draftBefore.includes('"preset":"ocean"'), 'preset POST saves user draft');
            const colorFields = Object.fromEntries(
              [...html.matchAll(/name="(tokens\[[^"]+\]\[(?:value|dark)\])" value="([^"]+)"/g)].map((m) => [
                m[1],
                m[2],
              ]),
            );
            const low = { ...colorFields, 'tokens[color-text][value]': colorFields['tokens[color-bg][value]'] };
            response = await submit(2, html, low);
            check(
              response.status === 302 && response.headers.get('location')?.includes('error=contrast'),
              'low contrast POST rejected',
            );
            check(
              command('user', 'meta', 'get', 'admin', 'blixis_setup_draft') === draftBefore,
              'rejected contrast preserves draft',
            );
            response = await submit(2, html, colorFields);
            check(response.status === 302, 'valid colors advance');
            const fontPost = command(
              'post',
              'create',
              '--post_type=wp_font_family',
              '--post_status=publish',
              '--post_title=Smoke Inter',
              '--post_name=smoke-inter',
              '--post_content={"fontFamily":"Smoke Inter, sans-serif"}',
              '--porcelain',
            );
            // WordPress stores each face as a child post (the shape the Font Library screen writes).
            command(
              'post',
              'create',
              '--post_type=wp_font_face',
              '--post_status=publish',
              `--post_parent=${fontPost.trim()}`,
              '--post_content={"fontFamily":"Smoke Inter","fontWeight":"400","fontStyle":"normal","src":"https://example.test/smoke-inter.woff2"}',
              '--porcelain',
            );
            html = await stepPage(3);
            check(
              html.includes('Smoke Inter (400 normal)'),
              'installed Font Library family and variant appear in Typography',
            );
            const typographyBefore = command('user', 'meta', 'get', 'admin', 'blixis_setup_draft');
            const typography = JSON.parse(typographyBefore).tokens;
            const typographyFields = {
              'tokens[font-body][value]': '"Smoke Inter", system-ui, sans-serif',
              'tokens[font-heading][value]': typography['font-heading'].value,
              'tokens[text-base][value]': typography['text-base'].value,
            };
            response = await submit(3, html, {
              ...typographyFields,
              'tokens[font-body][value]': 'Evil; background:url(x)',
            });
            check(
              response.status === 302 && response.headers.get('location')?.includes('error=invalid'),
              'hostile font stack rejected',
            );
            check(
              command('user', 'meta', 'get', 'admin', 'blixis_setup_draft') === typographyBefore,
              'rejected font leaves draft unchanged',
            );
            response = await submit(3, html, typographyFields);
            check(response.status === 302, 'installed Font Library family accepted');
            check(
              JSON.parse(command('user', 'meta', 'get', 'admin', 'blixis_setup_draft')).tokens['font-body'].value ===
                typographyFields['tokens[font-body][value]'],
              'font choice saved in draft',
            );
            for (let step = 4; step <= 6; step++) {
              html = await stepPage(step);
              if (step < 5) {
                const current = JSON.parse(command('user', 'meta', 'get', 'admin', 'blixis_setup_draft'));
                const fields = Object.fromEntries(
                  [...html.matchAll(/<select[^>]+name="tokens\[([^"]+)\]\[value\]"/g)].map((m) => [
                    `tokens[${m[1]}][value]`,
                    current.tokens[m[1]].value,
                  ]),
                );
                response = await submit(step, html, fields);
                check(response.status === 302, `wizard step ${step} advances`);
              } else if (step === 5) {
                check(html.includes('Auto follows each visitor'), 'preview explains automatic website appearance');
                check(html.includes('<h3>Light</h3>') && html.includes('<h3>Dark</h3>'), 'preview shows both modes');
                const appearanceDraftBefore = command('user', 'meta', 'get', 'admin', 'blixis_setup_draft');
                response = await submit(step, html, { appearance: 'invalid' });
                check(
                  response.status === 302 && response.headers.get('location')?.includes('error=invalid'),
                  'invalid website appearance is rejected',
                );
                check(
                  command('user', 'meta', 'get', 'admin', 'blixis_setup_draft') === appearanceDraftBefore,
                  'invalid website appearance preserves the draft',
                );
                response = await submit(step, html, { appearance: 'auto' });
                check(response.status === 302, 'preview advances to Apply');
              }
            }
            // BWB-035: applying persists the design system, completes setup and prints the saved tokens.
            html = await stepPage(6);
            response = await submit(6, html, {}, 'apply');
            check(
              response.status === 302 && response.headers.get('location')?.includes('applied=1'),
              'apply saves the design system',
            );
            const saved = JSON.parse(command('option', 'get', 'blixis_design_system', '--format=json'));
            check(command('option', 'get', 'blixis_appearance') === 'auto', 'Apply saves the website appearance');
            check(
              command(
                'eval',
                "echo array_key_exists('blixis_appearance', wp_load_alloptions()) ? 'autoload' : 'no';",
              ) === 'autoload',
              'the website appearance option is autoloaded',
            );
            check(
              saved.tokenVersion === 1 && saved.preset === 'ocean',
              'the saved design system is version 1 of the ocean preset',
            );
            check(
              saved.tokens['color-bg'].value === '#f8fbff' && saved.tokens['color-bg'].dark === '#0b1726',
              'apply persists both the light and the dark value of each color token',
            );
            check(
              JSON.parse(command('option', 'get', 'blixis_setup', '--format=json')).status === 'completed',
              'setup is completed only after the design system was saved',
            );
            check(
              command(
                'eval',
                "echo array_key_exists('blixis_design_system', wp_load_alloptions()) ? 'autoload' : 'no';",
              ) === 'autoload',
              'the design system is autoloaded (every page needs it)',
            );
            check(
              (await get('/')).text.includes('--blx-color-bg:#f8fbff'),
              'the front page prints the saved tokens after the bundled ones',
            );
            check(
              command(
                'eval',
                "echo get_user_meta( get_user_by( 'login', 'admin' )->ID, 'blixis_setup_draft', true ) === '' ? 'cleared' : 'kept';",
              ) === 'cleared',
              'applying clears the draft',
            );
            // A second save moves the version forward, keeps the first in the history and can be rolled back.
            command('eval-file', '/fixtures/blixis-second-save.php');
            const second = JSON.parse(command('option', 'get', 'blixis_design_system', '--format=json'));
            check(second.tokenVersion === 2, 'a second save raises the token version');
            // BWB-037: compare the raw persisted values across child and incompatible theme switches.
            const snapshot = () =>
              command(
                'eval',
                "echo wp_json_encode( array( 'setup' => get_option( 'blixis_setup' ), 'design' => get_option( 'blixis_design_system' ), 'history' => get_option( 'blixis_design_system_history' ), 'ui' => get_user_meta( get_user_by( 'login', 'admin' )->ID, 'blixis_setup_ui', true ), 'draft' => get_user_meta( get_user_by( 'login', 'admin' )->ID, 'blixis_setup_draft', true ) ) );",
              );
            const beforeSwitch = snapshot();
            try {
              command('theme', 'activate', 'blixis-child-fixture');
              check(
                command('eval', 'echo \\Blixis\\Theme\\Compat::active();') === '1',
                'child inherits Blixis-Compat 1',
              );
              const childHome = await get('/');
              check(
                childHome.status === 200 &&
                  childHome.text.includes('class="skip-link') &&
                  childHome.text.includes('<main id="content"') &&
                  childHome.text.includes('Blixis child fixture footer'),
                'child renders inherited chrome and its footer override',
              );
              for (const asset of ['tokens.css', 'theme.css']) {
                check(
                  childHome.text.includes(`${base}/wp-content/themes/blixis/assets/css/${asset}`) &&
                    !childHome.text.includes(`/wp-content/themes/blixis-child-fixture/assets/css/${asset}`),
                  `child loads ${asset} from the parent URL`,
                );
              }
              check(
                childHome.text.includes(`${base}/wp-content/themes/blixis/style.css`) &&
                  childHome.text.includes(`${base}/wp-content/themes/blixis-child-fixture/style.css`),
                'child loads both the parent baseline and its own stylesheet',
              );
              const stylesInOrder = [
                '/wp-content/themes/blixis/style.css',
                '/wp-content/themes/blixis/assets/css/tokens.css',
                '/wp-content/themes/blixis/assets/css/theme.css',
                '/wp-content/themes/blixis-child-fixture/style.css',
              ].map((url) => childHome.text.indexOf(url));
              check(
                stylesInOrder.every(
                  (position, index) => position >= 0 && (index === 0 || position > stylesInOrder[index - 1]),
                ),
                'parent styles load before the child override',
              );
              check(
                childHome.text.includes('--blx-color-bg:#ffffff'),
                'child prints the saved design system inline CSS',
              );
              const childSetup = await http(`${base}/wp-admin/themes.php?page=blixis-setup`, {
                headers: { cookie: adminCookie },
              });
              check(
                childSetup.status === 200 && (await childSetup.text()).includes('Blixis setup'),
                'admin can reach setup while the child is active',
              );
              command('theme', 'activate', 'blixis-child-invalid-fixture');
              check(
                command('eval', 'echo is_null( \\Blixis\\Theme\\Compat::active() ) ? "null" : "declared";') === 'null',
                'invalid child header does not inherit compatibility',
              );
              command('theme', 'activate', 'blixis-other-fixture');
              check(
                command('eval', 'echo class_exists( "\\Blixis\\Theme\\Compat" ) ? "loaded" : "absent";') === 'absent',
                'Blixis theme classes are absent on the standalone theme',
              );
            } finally {
              command('theme', 'activate', 'blixis');
            }
            check(
              snapshot() === beforeSwitch,
              'theme switches and after_switch_theme preserve setup, design, history and user meta',
            );
            const setupHtml = await (
              await http(`${base}/wp-admin/themes.php?page=blixis-setup`, { headers: { cookie: adminCookie } })
            ).text();
            const rollbackNonce = setupHtml.match(/name="blixis_setup_nonce_rollback" value="([a-z0-9]+)"/)?.[1];
            check(Boolean(rollbackNonce), 'the restore form has a nonce');
            const editorRollback = await http(`${base}/wp-admin/admin-post.php`, {
              method: 'POST',
              redirect: 'manual',
              headers: { cookie: editorCookie, 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                action: 'blixis_setup_rollback',
                blixis_setup_nonce_rollback: rollbackNonce ?? '',
              }),
            });
            check(editorRollback.status === 403, 'an editor cannot restore the design system');
            const rolledBack = await http(`${base}/wp-admin/admin-post.php`, {
              method: 'POST',
              redirect: 'manual',
              headers: { cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                action: 'blixis_setup_rollback',
                blixis_setup_nonce_rollback: rollbackNonce ?? '',
              }),
            });
            check(rolledBack.status === 302, 'restore redirects after an authorized POST');
            const restored = JSON.parse(command('option', 'get', 'blixis_design_system', '--format=json'));
            check(
              restored.tokenVersion === 3 && restored.tokens['color-bg'].value === '#f8fbff',
              'restore brings back the first design system under a new, higher version',
            );
            check(
              restored.tokens['color-bg'].dark === '#0b1726',
              'restore brings back the dark values together with the light values',
            );
            command('post', 'delete', fontPost.trim(), '--force');
            command('option', 'delete', 'blixis_design_system');
            command('option', 'delete', 'blixis_design_system_history');
            command('user', 'meta', 'delete', 'admin', 'blixis_setup_ui');
            // Back to a started, unfinished setup so the checks that follow see the state they expect.
            command(
              'option',
              'update',
              'blixis_setup',
              '{"version":1,"status":"in_progress","updated_at":"2026-10-14T10:00:00+00:00"}',
              '--format=json',
            );
          }
        }
      }
      command(
        'option',
        'update',
        'blixis_setup',
        '{"version":1,"status":"completed","updated_at":"2026-10-14T10:00:00+00:00"}',
        '--format=json',
      );
      command('theme', 'activate', inactive);
      command('theme', 'activate', 'blixis');
      const reactivated = JSON.parse(command('option', 'get', 'blixis_setup', '--format=json'));
      check(reactivated.status === 'completed', 'reactivation preserves completed setup');
      if (previous.status === 0) {
        command('option', 'update', 'blixis_setup', String(previous.stdout).trim(), '--format=json');
      } else {
        command('option', 'delete', 'blixis_setup');
      }
    }

    // Builder storage (BWB-040): compare-and-swap, revisions, recovery and authorization on real WordPress.
    const storageRun = wpCmd('eval-file', '/fixtures/storage-smoke.php');
    check(storageRun.status === 0, 'the storage smoke script runs');
    let storage = {};
    try {
      storage = JSON.parse(String(storageRun.stdout).trim().split('\n').pop());
    } catch {
      check(false, `the storage smoke script printed JSON (${String(storageRun.stderr).slice(0, 200)})`);
    }
    for (const [name, label] of [
      ['first', 'the first write to a stream succeeds'],
      ['stale_blocked', 'a write with a stale revision is a conflict'],
      ['second', 'a write with the current revision succeeds'],
      ['nl_independent', 'another locale stream is independent of the layout stream'],
      ['single_row', 'a stream stays a single postmeta row'],
      ['revision_created', 'core created a post revision'],
      ['restore_keeps_layout', 'restoring a core revision leaves the builder stream untouched'],
      ['autosave_ran', 'core autosave ran'],
      ['autosave_keeps_layout', 'autosave leaves the builder stream untouched'],
      ['orphan_listed', 'an unreferenced snapshot (interrupted publish) is listed'],
      ['live_pointer_none', 'the live pointer did not change after the interrupted publish'],
      ['orphan_collected', 'collecting removes the orphan snapshot'],
      ['publish_ok', 'publishing writes the snapshot and advances the pointer'],
      ['snapshot_immutable', 'an existing snapshot cannot be overwritten'],
      ['referenced_kept', 'collecting keeps referenced snapshots'],
      ['hostile_rejected', 'a hostile meta key is rejected'],
    ]) {
      check(storage[name] === true, label);
    }
    check(storage.revision_has_builder_meta === false, 'core revisions do not copy builder meta');
    check(storage.autosave_has_builder_meta === false, 'core autosaves do not copy builder meta');
    check(
      storage.auth?.admin_fixed === true && storage.auth?.editor_dynamic === true,
      'administrators and editors may edit builder meta of the page',
    );
    check(
      storage.auth?.author_other === false &&
        storage.auth?.subscriber === false &&
        storage.auth?.contributor === false &&
        storage.auth?.foreign_protected === false,
      'authors of other pages, contributors, subscribers and unknown _blixis_ keys may not',
    );
    console.log(`storage: MariaDB/MySQL ${storage.mysql}, PHP ${storage.php}, WordPress ${storage.wp}`);

    // Concurrent writers: exactly one wins the first write, and exactly one wins each later revision.
    const racePost = command(
      'post',
      'create',
      '--post_type=page',
      '--post_status=draft',
      '--post_title=Race',
      '--porcelain',
    );
    const race = (expected) =>
      Promise.all(
        Array.from(
          { length: 6 },
          () =>
            new Promise((resolve) => {
              const child = spawn(
                'docker',
                [
                  'compose',
                  '-p',
                  PROJECT,
                  ...files,
                  'run',
                  '--rm',
                  '-T',
                  'cli',
                  'wp',
                  'eval',
                  `$s = new \\Blixis\\Builder\\Storage\\StreamStore( new \\Blixis\\Builder\\Storage\\WpdbDatabase( $GLOBALS['wpdb'] ) ); ` +
                    `echo $s->write( ${racePost}, '_blixis_layout', '{"schemaVersion":1,"layoutRevision":1,"w":"' . getmypid() . '"}', ${expected} )->success ? 'WIN' : 'LOSE';`,
                ],
                { cwd: root, env, stdio: ['ignore', 'pipe', 'ignore'] },
              );
              let out = '';
              child.stdout.on('data', (d) => (out += d));
              child.on('close', () => resolve(out.includes('WIN')));
            }),
        ),
      );
    const firstRace = (await race(0)).filter(Boolean).length;
    check(firstRace === 1, `exactly one of six concurrent first writes wins (${firstRace})`);
    const nextRace = (await race(1)).filter(Boolean).length;
    check(nextRace === 1, `exactly one of six concurrent updates of revision 1 wins (${nextRace})`);
    check(
      command(
        'eval',
        `echo get_post_meta( ${racePost}, '_blixis_layout' ) ? count( get_post_meta( ${racePost}, '_blixis_layout' ) ) : 0;`,
      ) === '1',
      'concurrent writers leave exactly one row',
    );
    command('post', 'delete', racePost, '--force');

    // Builder plugin lifecycle (BWB-039): activation stores the version once, deactivation keeps it, uninstall removes it.
    const builderOption = () => wpCmd('option', 'get', 'blixis_builder_version');
    wpCmd('plugin', 'deactivate', 'blixis-builder');
    wpCmd('option', 'delete', 'blixis_builder_version');
    command('plugin', 'activate', 'blixis-builder');
    check(builderOption().stdout.toString().trim() === '0.1.0', 'activating the Builder stores its version');
    command('option', 'update', 'blixis_builder_version', 'kept-value');
    command('plugin', 'deactivate', 'blixis-builder');
    command('plugin', 'activate', 'blixis-builder');
    check(builderOption().stdout.toString().trim() === 'kept-value', 'reactivating the Builder keeps existing state');
    check(
      command('eval', "echo array_key_exists('blixis_builder_version', wp_load_alloptions()) ? 'autoload' : 'no';") ===
        'no',
      'the Builder version option is not autoloaded',
    );
    check((await get('/')).status === 200, 'the front page renders with the Builder active');
    command('plugin', 'deactivate', 'blixis-builder');
    check(builderOption().status === 0, 'deactivating the Builder deletes no options');
    command('plugin', 'activate', 'blixis-builder');
  }
  // The wizard also writes this option; leave the fixture site's prior setting intact.
  if (appearanceBefore.status === 0) {
    wpOut('option', 'update', 'blixis_appearance', String(appearanceBefore.stdout).trim());
  } else {
    capture(['run', '--rm', '-T', 'cli', 'wp', 'option', 'delete', 'blixis_appearance']);
  }
  // WP_DEBUG_LOG writes PHP warnings, notices and deprecations to wp-content/debug.log. Only what this run appended counts
  // (the log may hold older entries), and nothing in it may point into the theme.
  const themeErrors = out([
    'exec',
    '-T',
    'wordpress',
    'sh',
    '-c',
    `tail -c +${String(logOffset + 1)} /var/www/html/wp-content/debug.log 2>/dev/null | grep -c '/themes/blixis/' || true`,
  ]);
  check(
    themeErrors === '0',
    'the theme logged no PHP warnings, notices or deprecations while the smoke pages rendered',
  );

  const langs = out([
    'run',
    '--rm',
    '-T',
    'cli',
    'wp',
    'language',
    'core',
    'list',
    '--status=installed',
    '--field=language',
  ]).split('\n');
  check(langs.includes('nl_NL'), 'Dutch (nl_NL) language pack is installed');
  const users = out(['run', '--rm', '-T', 'cli', 'wp', 'user', 'list', '--field=user_login']).split('\n');
  for (const u of ['admin', 'editor_ed', 'author_ann', 'contributor_con', 'subscriber_sub'])
    check(users.includes(u), `fixture user ${u} exists`);

  if (failures.length) {
    console.error(`\n${failures.length} smoke check(s) failed`);
    process.exit(1);
  }
  console.log('\nWordPress smoke test passed');
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'up':
    must(compose(['up', '--detach', '--wait', 'wordpress']), 'docker compose up');
    break;
  case 'install':
    await install();
    break;
  case 'start':
    must(compose(['up', '--detach', '--wait', 'wordpress']), 'docker compose up');
    await install();
    break;
  case 'down':
    must(compose(['down']), 'docker compose down');
    break;
  case 'reset':
    must(compose(['down', '--volumes']), 'docker compose down --volumes');
    break;
  case 'cli':
    process.exit(wp(...rest).status ?? 1);
    break;
  case 'logs':
    compose(['logs', '--tail=200', ...rest]);
    break;
  case 'smoke':
    await smoke();
    break;
  default:
    console.error('usage: wp-env.mjs <up|install|start|down|reset|cli <wp-cli args>|logs|smoke>');
    process.exit(2);
}
