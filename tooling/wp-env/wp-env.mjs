#!/usr/bin/env node
// Local WordPress environment commands (BWB-012): up, install, down, reset, cli, logs, smoke.
// Wraps docker/compose.yml. Requires Docker. Configuration through environment variables:
//   BLX_WP_IMAGE, BLX_CLI_IMAGE, BLX_DB_IMAGE  override the pinned images
//   BLX_WP_PORT                                host port on 127.0.0.1 (default 8888)
//   BLX_EXPECT_WP, BLX_EXPECT_PHP              smoke test expectations (version prefixes)
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = process.env.BLX_WP_PORT ?? '8888';
const base = `http://127.0.0.1:${port}`;
const compose = (args, opts = {}) =>
  spawnSync('docker', ['compose', '-f', join(root, 'docker', 'compose.yml'), ...args], {
    cwd: root,
    stdio: 'inherit',
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
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${url} did not become reachable within ${seconds}s`);
}

async function install() {
  await waitForHttp(base);
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
  console.log(`\nWordPress is ready at ${base} (admin / password; development only, bound to localhost).`);
}

async function smoke() {
  const failures = [];
  const check = (ok, message) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
    if (!ok) failures.push(message);
  };
  const get = async (path) => {
    const r = await fetch(base + path, { redirect: 'follow' });
    return { status: r.status, text: await r.text() };
  };

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

  const version = capture(['run', '--rm', '-T', 'cli', 'wp', 'core', 'version']);
  const wpVersion = String(version.stdout ?? '').trim();
  const php = capture(['exec', '-T', 'wordpress', 'php', '-r', 'echo PHP_VERSION;']);
  const phpVersion = String(php.stdout ?? '').trim();
  console.log(`versions: WordPress ${wpVersion}, PHP ${phpVersion}`);
  if (process.env.BLX_EXPECT_WP)
    check(
      wpVersion.startsWith(process.env.BLX_EXPECT_WP),
      `WordPress version starts with ${process.env.BLX_EXPECT_WP}`,
    );
  if (process.env.BLX_EXPECT_PHP)
    check(phpVersion.startsWith(process.env.BLX_EXPECT_PHP), `PHP version starts with ${process.env.BLX_EXPECT_PHP}`);

  const langs = capture([
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
  ]);
  check(String(langs.stdout ?? '').includes('nl_NL'), 'Dutch (nl_NL) language pack is installed');
  const users = capture(['run', '--rm', '-T', 'cli', 'wp', 'user', 'list', '--field=user_login']);
  for (const u of ['admin', 'editor_ed', 'author_ann', 'contributor_con', 'subscriber_sub'])
    check(String(users.stdout ?? '').includes(u), `fixture user ${u} exists`);

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
