import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, tokensForCompile, validateTokenSet } from '@blixis/wp-style-engine';

const theme = dirname(fileURLToPath(import.meta.url));
if (process.argv.length > 4) throw new Error('Usage: node build-tokens.mjs [theme.json] [tokens.css]');
const jsonOutput = process.argv[2] ? resolve(process.argv[2]) : join(theme, 'theme.json');
const cssOutput = process.argv[3] ? resolve(process.argv[3]) : join(theme, 'assets/css/tokens.css');
const source = JSON.parse(await readFile(join(theme, 'design/default-tokens.json'), 'utf8'));
const validated = validateTokenSet(source);
if (!validated.ok) throw new Error(`Invalid default tokens: ${JSON.stringify(validated.issues)}`);
const { set } = validated;
const byName = new Map(set.tokens.map((token) => [token.name, token]));

function entry(name, category, field) {
  const token = byName.get(name);
  if (token?.category !== category) throw new Error(`Missing ${category} token: ${name}`);
  return { slug: name, name: token.label ?? name, [field]: `var(--blx-${name})` };
}

const names = (category) => set.tokens.filter((token) => token.category === category).map((token) => token.name);
const themeJson = {
  $schema: 'https://schemas.wp.org/wp/7.0/theme.json',
  version: 3,
  settings: {
    color: { palette: names('color').map((name) => entry(name, 'color', 'color')) },
    typography: {
      fontSizes: names('font-size').map((name) => entry(name, 'font-size', 'size')),
      fontFamilies: names('font-family').map((name) => entry(name, 'font-family', 'fontFamily')),
    },
    spacing: { spacingSizes: names('spacing').map((name) => entry(name, 'spacing', 'size')) },
    layout: {
      contentSize: `var(--blx-${entry('container-content', 'container', 'size').slug})`,
      wideSize: `var(--blx-${entry('container-wide', 'container', 'size').slug})`,
    },
  },
};

const compiled = compile({ document: { root: [] }, tokens: tokensForCompile(set) });
if (compiled.issues.length > 0) throw new Error(`Token CSS compilation failed: ${JSON.stringify(compiled.issues)}`);
await writeFile(jsonOutput, `${JSON.stringify(themeJson, null, 2)}\n`);
await writeFile(cssOutput, compiled.css);
