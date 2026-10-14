#!/usr/bin/env node
// Local WordPress environment commands (BWB-012): up, install, down, reset, cli, logs, smoke.
// Wraps docker/compose.yml. Requires Docker. Configuration through environment variables:
//   BLX_WP_IMAGE, BLX_CLI_IMAGE, BLX_DB_IMAGE  override the pinned images
//   BLX_WP_PORT                                host port on 127.0.0.1 (default 8888)
//   BLX_EXPECT_WP, BLX_EXPECT_PHP              smoke test expectations (version prefixes)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
            for (let step = 3; step <= 6; step++) {
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
                response = await submit(step, html, {});
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
            check(
              saved.tokenVersion === 1 && saved.preset === 'ocean',
              'the saved design system is version 1 of the ocean preset',
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
