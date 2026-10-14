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

async function smoke() {
  const failures = [];
  const check = (ok, message) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
    if (!ok) failures.push(message);
  };
  const get = async (path) => {
    const r = await fetch(base + path, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
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
