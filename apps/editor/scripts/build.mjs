// Builds dist/editor.js and dist/canvas.js (esbuild; the canvas runtime is a second, React-free bundle), dist/editor.css (Tailwind v4 via @tailwindcss/node + @tailwindcss/oxide, like the
// theme: no CLI, no Vite plugin) and dist/manifest.json. Deterministic: two runs produce identical bytes.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, optimize } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { build as esbuild, context as esbuildContext } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(dirname(root));

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const jsOptions = (outfile) => ({
  entryPoints: [join(root, 'src/main.tsx')],
  outfile,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  sourcemap: false,
  legalComments: 'external',
  metafile: true,
  absWorkingDir: root,
  jsx: 'automatic',
  charset: 'ascii',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: join(root, 'tsconfig.json'),
});

/** The canvas runtime: the only script of the canvas iframe. Plain TypeScript, no React, no third-party code expected. */
const canvasOptions = (outfile) => ({
  entryPoints: [join(root, 'src/canvas/runtime.ts')],
  outfile,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  absWorkingDir: root,
  charset: 'ascii',
  logLevel: 'warning',
  tsconfig: join(root, 'tsconfig.json'),
});

const richtextOptions = (outfile) => ({
  ...canvasOptions(outfile),
  entryPoints: [join(root, 'src/canvas/richtext-entry.ts')],
  globalName: 'BlixisRichText',
  legalComments: 'external',
});

export async function buildCss() {
  const input = join(root, 'src/styles/editor.src.css');
  const compiler = await compile(await readFile(input, 'utf8'), {
    base: dirname(input),
    from: input,
    onDependency() {},
  });
  const scanner = new Scanner({
    sources: [
      { base: join(root, 'src'), pattern: '**/*.{ts,tsx}', negated: false },
      { base: join(repo, 'packages/editor-ui/src'), pattern: '**/*.{ts,tsx}', negated: false },
    ],
  });
  const css = compiler.build(scanner.scan());
  return stripPropertiesFallback(optimize(css, { file: input, minify: true }).code);
}

/**
 * Tailwind emits an `@layer properties` fallback whose selector is the universal `*` (for browsers without
 * `@property`). It would style every element on the page, so it is removed; the `@property` rules that remain
 * provide the initial values in every supported browser.
 */
export function stripPropertiesFallback(css) {
  const start = css.indexOf('@layer properties{');
  if (start === -1) return css;
  let depth = 0;
  for (let index = start; index < css.length; index++) {
    if (css[index] === '{') depth++;
    else if (css[index] === '}' && --depth === 0) return css.slice(0, start) + css.slice(index + 1);
  }
  throw new Error('unbalanced @layer properties block');
}

export async function buildEditor({ outDir = join(root, 'dist') } = {}) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const editor = await esbuild(jsOptions(join(outDir, 'editor.js')));
  const canvas = await esbuild(canvasOptions(join(outDir, 'canvas.js')));
  const richtext = await esbuild(richtextOptions(join(outDir, 'richtext.js')));
  const { gzipSync } = await import('node:zlib');
  const gzipBytes = gzipSync(await readFile(join(outDir, 'richtext.js')), { level: 9 }).byteLength;
  if (gzipBytes >= 200_000) throw new Error(`richtext.js gzip budget exceeded: ${gzipBytes} bytes`);
  await writeNotice(outDir, [editor.metafile, canvas.metafile, richtext.metafile]);
  return writeAssets(outDir);
}

/** Package directory (…/node_modules/<name>) that a bundled input file belongs to, or null for first-party files. */
function packageDirOf(input) {
  const marker = 'node_modules/';
  const at = input.lastIndexOf(marker);
  if (at === -1) return null;
  const rest = input.slice(at + marker.length).split('/');
  const length = rest[0]?.startsWith('@') ? 2 : 1;
  return input.slice(0, at + marker.length) + rest.slice(0, length).join('/');
}

/**
 * Writes `NOTICE.txt`: every third-party package that is bundled into editor.js or canvas.js (taken from esbuild's metafile, so
 * it is exactly what ships), with exact version, licence id and licence text (ADR 0008 section 4). Sorted, so the
 * file is reproducible.
 */
async function writeNotice(outDir, metafiles) {
  const dirs = new Set();
  for (const metafile of metafiles) {
    for (const input of Object.keys(metafile.inputs)) {
      const dir = packageDirOf(input);
      if (dir !== null) dirs.add(dir);
    }
  }
  const byId = new Map();
  for (const dir of dirs) {
    const manifest = JSON.parse(await readFile(resolve(root, dir, 'package.json'), 'utf8'));
    const files = await readdir(resolve(root, dir));
    const licenceFile = files.sort().find((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name));
    const text = licenceFile ? await readFile(resolve(root, dir, licenceFile), 'utf8') : null;
    const licence = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type;
    if (!licence) throw new Error(`no licence id declared by ${manifest.name}`);
    const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const fallback = `No licence file is shipped in the package. Declared licence: ${licence}.${repository ? ` Source: ${repository}` : ''}`;
    byId.set(`${manifest.name}@${manifest.version}`, {
      name: manifest.name,
      version: manifest.version,
      licence,
      text: text === null ? fallback : text.replace(/\r\n/g, '\n').trim(),
    });
  }
  const packages = [...byId.values()];
  packages.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
  const sections = packages.map((p) => {
    const attribution =
      p.name === '@iconify-icons/solar'
        ? '\nSolar Icon Set by 480 Design, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/\nSource: https://www.figma.com/community/file/1166831539721848736\nSolar icons are used unmodified.\n'
        : '';
    return `${p.name}@${p.version}\nLicense: ${p.licence}\n\n${p.text}${attribution}\n`;
  });
  const header =
    'Third-party software bundled into editor.js, canvas.js and richtext.js (Blixis Blocks editor).\n' +
    'Inline legal comments of the bundle are in editor.js.LEGAL.txt.\n';
  await writeFile(join(outDir, 'NOTICE.txt'), `${[header, ...sections].join(`\n${'-'.repeat(72)}\n\n`)}`);
}

async function writeAssets(outDir) {
  await writeFile(join(outDir, 'editor.css'), await buildCss());
  const js = await readFile(join(outDir, 'editor.js'));
  const css = await readFile(join(outDir, 'editor.css'));
  const canvasJs = await readFile(join(outDir, 'canvas.js'));
  const richtextJs = await readFile(join(outDir, 'richtext.js'));
  const manifest = {
    version: 1,
    js: 'editor.js',
    css: 'editor.css',
    jsSha256: sha256(js),
    cssSha256: sha256(css),
    canvasJs: 'canvas.js',
    canvasJsSha256: sha256(canvasJs),
    richtextJs: 'richtext.js',
    richtextJsSha256: sha256(richtextJs),
  };
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex === -1 ? join(root, 'dist') : resolve(args[outIndex + 1] ?? '');
  if (outIndex !== -1) args.splice(outIndex, 2);
  const unknown = args.filter((a) => a !== '--watch' && a !== '--verify-reproducible');
  if (unknown.length > 0) {
    throw new Error(`Usage: build.mjs [--out dir] [--watch] [--verify-reproducible] (unknown: ${unknown.join(' ')})`);
  }
  if (args.includes('--watch')) {
    const dist = outDir;
    await mkdir(dist, { recursive: true });
    const metafiles = {};
    const finish = () => {
      if (metafiles.editor === undefined || metafiles.canvas === undefined || metafiles.richtext === undefined)
        return Promise.resolve();
      return writeNotice(dist, [metafiles.editor, metafiles.canvas, metafiles.richtext])
        .then(() => writeAssets(dist))
        .then(() => console.log('rebuilt'));
    };
    const watching = (name, options) =>
      esbuildContext({
        ...options,
        plugins: [
          {
            name: 'assets',
            setup: (b) =>
              b.onEnd((result) => {
                metafiles[name] = result.metafile;
                return finish();
              }),
          },
        ],
      });
    const contexts = [
      await watching('editor', jsOptions(join(dist, 'editor.js'))),
      await watching('canvas', canvasOptions(join(dist, 'canvas.js'))),
      await watching('richtext', richtextOptions(join(dist, 'richtext.js'))),
    ];
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    return;
  }
  const first = await buildEditor({ outDir });
  if (args.includes('--verify-reproducible')) {
    const second = await buildEditor({ outDir });
    if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('editor build is not reproducible');
    console.log('editor build is reproducible');
  }
  console.log(JSON.stringify(first));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
