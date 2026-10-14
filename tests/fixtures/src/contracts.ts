import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFixtureValue } from './canonical.ts';
import { assertStrictJson } from './strict-json.ts';

/** Repository root (`tests/fixtures/src` is three levels below it). */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export type PhpLevel = 'full' | 'shape' | 'pending';

export interface ContractSuite {
  id: string;
  description: string;
  /** Files, or directories (every `.json` file below is part of the suite), relative to the repository root. */
  paths: string[];
  /** Test files that run the suite in TypeScript. */
  ts: string[];
  php: {
    /** `full`: PHP executes the suite's expectations. `shape`: PHP checks strict JSON and JSON Schema shape only. `pending`: not run yet. */
    level: PhpLevel;
    /** PHPUnit file that runs it (required unless pending). */
    runner?: string;
    /** Roadmap issue that delivers the PHP side (required when pending or shape-only). */
    issue?: string;
  };
}

export interface ContractRegistry {
  contractVersion: 1;
  suites: ContractSuite[];
}

export const REGISTRY_PATH = join(REPO_ROOT, 'tests', 'fixtures', 'contracts.json');

/** Directories whose JSON files are shared data: every one of them must belong to a suite (no orphans). */
const SCANNED = [
  'tests/fixtures',
  'packages/core/schema',
  'packages/design-tokens/schema',
  'packages/style-engine/corpus',
  'packages/style-engine/manifest',
  'packages/element-registry/manifest',
];
const IGNORED = new Set(['package.json', 'tsconfig.json', 'contracts.json']);

export function loadRegistry(): ContractRegistry {
  const text = readFileSync(REGISTRY_PATH, 'utf8');
  assertStrictJson(text);
  return JSON.parse(text) as ContractRegistry;
}

/** All `.json` files below `path` (a file or a directory), as repository-relative paths with `/` separators. */
export function jsonFilesUnder(path: string): string[] {
  const absolute = join(REPO_ROOT, path);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    if (statSync(current).isFile()) {
      if (current.endsWith('.json')) out.push(relative(REPO_ROOT, current).split(sep).join('/'));
      return;
    }
    for (const name of readdirSync(current).sort()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(join(current, name));
    }
  };
  walk(absolute);
  return out;
}

function roadmapIds(): Set<string> {
  const csv = readFileSync(join(REPO_ROOT, 'docs', 'roadmap', 'issues.csv'), 'utf8');
  return new Set([...csv.matchAll(/^(BWB-\d{3}),/gm)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])));
}

/** Problems with the registry itself; empty means consistent. */
export function checkRegistry(registry: ContractRegistry = loadRegistry()): string[] {
  const problems: string[] = [];
  if (String(registry.contractVersion) !== '1') problems.push('contractVersion must be 1');
  const ids = new Set<string>();
  const covered = new Set<string>();
  const roadmap = roadmapIds();
  for (const suite of registry.suites) {
    const where = `suite ${suite.id}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suite.id)) problems.push(`${where}: id must be kebab-case`);
    if (ids.has(suite.id)) problems.push(`${where}: duplicate id`);
    ids.add(suite.id);
    if (suite.description.trim() === '') problems.push(`${where}: description is required`);
    if (suite.paths.length === 0) problems.push(`${where}: no paths`);
    for (const path of suite.paths) {
      const files = jsonFilesUnder(path);
      if (files.length === 0) problems.push(`${where}: ${path} has no JSON files`);
      for (const file of files) {
        covered.add(file);
        try {
          const text = readFileSync(join(REPO_ROOT, file), 'utf8');
          assertStrictJson(text);
          assertFixtureValue(JSON.parse(text));
        } catch (error) {
          problems.push(`${where}: ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (suite.ts.length === 0) problems.push(`${where}: no TypeScript runner`);
    for (const runner of [...suite.ts, ...(suite.php.runner === undefined ? [] : [suite.php.runner])]) {
      if (!existsSync(join(REPO_ROOT, runner))) problems.push(`${where}: runner ${runner} does not exist`);
    }
    const { level, runner, issue } = suite.php;
    if (!['full', 'shape', 'pending'].includes(level))
      problems.push(`${where}: php.level must be full, shape or pending`);
    if (level !== 'pending' && runner === undefined) problems.push(`${where}: php.runner is required unless pending`);
    if ((level === 'pending' || level === 'shape') && (issue === undefined || !roadmap.has(issue))) {
      problems.push(`${where}: php.issue must be a roadmap issue (BWB-nnn) while the PHP side is ${level}`);
    }
  }
  for (const root of SCANNED) {
    for (const file of jsonFilesUnder(root)) {
      const name = file.split('/').at(-1) ?? file;
      if (!IGNORED.has(name) && !covered.has(file))
        problems.push(`${file} is not part of any contract suite (add it to tests/fixtures/contracts.json)`);
    }
  }
  return problems;
}
