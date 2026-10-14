import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, optimize } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const theme = dirname(fileURLToPath(import.meta.url));
const input = join(theme, 'assets/css/theme.src.css');
const output = process.argv[2] ? resolve(process.argv[2]) : join(theme, 'assets/css/theme.css');

if (process.argv.length > 3) throw new Error('Usage: node build-css.mjs [output.css]');

const compiler = await compile(await readFile(input, 'utf8'), {
  base: dirname(input),
  from: input,
  onDependency() {},
});

if (compiler.root !== 'none') {
  throw new Error('theme.src.css must disable automatic source scanning');
}

const candidates = new Scanner({ sources: compiler.sources }).scan();
const css = compiler.build(candidates);
await writeFile(output, optimize(css, { file: input, minify: true }).code);
