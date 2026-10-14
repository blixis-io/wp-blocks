import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../../../packages/style-engine/src/compile.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'compile-corpus');
const source = JSON.parse(readFileSync(join(root, 'style-resolution', 'cases.json'), 'utf8')) as {
  cases: {
    id: string;
    rules: { origin: string; value: string; classOrder?: number; mode?: string; breakpoint?: string; state?: string }[];
  }[];
};
const palette = [
  'red',
  'blue',
  'green',
  'white',
  'black',
  'gray',
  'silver',
  'teal',
  'navy',
  'olive',
  'maroon',
  'purple',
  'orange',
  'pink',
  'brown',
  'gold',
];

export function generated(): Map<string, string> {
  const files = new Map<string, string>();
  for (const fixture of source.cases) {
    const colors = new Map<string, string>();
    for (const rule of fixture.rules)
      if (!colors.has(rule.value)) colors.set(rule.value, palette[colors.size] ?? 'red');
    const own: { declarations: { color: string }; mode?: string; breakpoint?: string; state?: string }[] = [];
    const byOrder = new Map<number, typeof own>();
    for (const item of fixture.rules) {
      const rule = {
        ...(item.mode === undefined ? {} : { mode: item.mode }),
        ...(item.breakpoint === undefined ? {} : { breakpoint: item.breakpoint }),
        ...(item.state === undefined ? {} : { state: item.state }),
        declarations: { color: colors.get(item.value) ?? item.value },
      };
      if (item.origin === 'element') own.push(rule);
      else if (item.origin === 'class') {
        const order = item.classOrder ?? 1;
        byOrder.set(order, [...(byOrder.get(order) ?? []), rule]);
      }
    }
    const classes = [...byOrder.keys()]
      .sort((a, b) => a - b)
      .map((order) => ({
        id: `cls-${String(order).padStart(3, '0')}`,
        rules: byOrder.get(order) ?? [],
      }));
    const document = {
      documentId: 'doc-001',
      root: [{ id: 'el-a', children: [], style: own, classIds: classes.map((cls) => cls.id).reverse() }],
    };
    const result = compile({ document, classes } as unknown as Parameters<typeof compile>[0]);
    const input = { document, classes };
    files.set(`${fixture.id}.json`, `${JSON.stringify(input, null, 2)}\n`);
    files.set(`${fixture.id}.css`, result.css);
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(output, { recursive: true });
  const files = generated();
  for (const file of readdirSync(output)) if (!files.has(file)) throw new Error(`unexpected corpus file: ${file}`);
  for (const [name, data] of files) writeFileSync(join(output, name), data);
}
