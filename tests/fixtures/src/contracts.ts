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
  /** Explicitly PHP-owned output corpus with no TypeScript renderer. */
  phpOnly?: boolean;
  php: {
    /** `full`: PHP executes the suite's expectations. `shape`: PHP checks strict JSON and JSON Schema shape only. `pending`: not run yet. */
    level: PhpLevel;
    /** PHPUnit file that runs it (required unless pending). */
    runner?: string;
    /** Test methods in `runner` that check this suite (required unless pending; each must exist in the file). */
    covers?: string[];
    /** Roadmap issue that delivers the PHP side (required when pending or shape-only). */
    issue?: string;
  };
}

export interface ContractRegistry {
  contractVersion: 1;
  suites: ContractSuite[];
}

export const REGISTRY_PATH = join(REPO_ROOT, 'tests', 'fixtures', 'contracts.json');

/** A JSON file in a directory with one of these names is shared data and must belong to a suite (no orphans). */
const DATA_DIRECTORY_NAMES = new Set(['corpus', 'manifest', 'schema', 'fixtures', 'golden', 'contracts']);
/** Exact paths (or `dir/` prefixes) that are tooling configuration or belong to another test family. */
const NOT_SHARED_DATA = [
  'tests/fixtures/package.json',
  'tests/fixtures/tsconfig.json',
  'tests/fixtures/contracts.json',
  'packages/element-registry/manifest/element-definitions-v2.json',
  'packages/element-registry/manifest/palette-catalog.json',
  'wordpress/plugin/data/element-definitions-v2.json',
  'tooling/fixtures/',
];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'vendor', '.git', 'dist', 'coverage', 'docs']);

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

/** Every JSON file in the repository that sits in a data directory (derived, not a fixed list of roots). */
export function sharedDataFiles(): string[] {
  const out: string[] = [];
  const walk = (current: string, inData: boolean): void => {
    for (const name of readdirSync(current).sort()) {
      if (SKIPPED_DIRECTORIES.has(name) || name.startsWith('.')) continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path, inData || DATA_DIRECTORY_NAMES.has(name));
      else if (inData && name.endsWith('.json')) out.push(relative(REPO_ROOT, path).split(sep).join('/'));
    }
  };
  walk(REPO_ROOT, false);
  return out;
}

/** Data files that no suite lists. */
export function findOrphans(files: readonly string[], covered: ReadonlySet<string>): string[] {
  return files.filter(
    (file) => !covered.has(file) && !NOT_SHARED_DATA.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p)),
  );
}

function roadmapIds(): Set<string> {
  // The main catalogue and the multilingual/theme-mode addendum together are the roadmap.
  const ids = new Set<string>();
  for (const file of ['issues.csv', 'issues-addendum.csv']) {
    const csv = readFileSync(join(REPO_ROOT, 'docs', 'roadmap', file), 'utf8');
    for (const m of csv.matchAll(/^(BWB-\d{3}),/gm)) if (m[1] !== undefined) ids.add(m[1]);
  }
  return ids;
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
    if (suite.ts.length === 0 && suite.phpOnly !== true) problems.push(`${where}: no TypeScript runner`);
    if (suite.phpOnly === true && (suite.ts.length > 0 || suite.php.level !== 'full'))
      problems.push(`${where}: phpOnly needs an empty ts list and a full PHP runner`);
    for (const runner of [...suite.ts, ...(suite.php.runner === undefined ? [] : [suite.php.runner])]) {
      if (!existsSync(join(REPO_ROOT, runner))) problems.push(`${where}: runner ${runner} does not exist`);
    }
    const { level, runner, issue } = suite.php;
    if (!['full', 'shape', 'pending'].includes(level))
      problems.push(`${where}: php.level must be full, shape or pending`);
    if (level !== 'pending' && runner === undefined) problems.push(`${where}: php.runner is required unless pending`);
    const covers = suite.php.covers ?? [];
    if (level === 'pending' && (runner !== undefined || covers.length > 0))
      problems.push(`${where}: a pending suite has no PHP runner or covers yet (promote its level)`);
    if (level !== 'pending' && covers.length === 0)
      problems.push(`${where}: php.covers must name the test methods that check this suite`);
    if (runner !== undefined && existsSync(join(REPO_ROOT, runner))) {
      const source = readFileSync(join(REPO_ROOT, runner), 'utf8');
      for (const method of covers) {
        if (!new RegExp(`function\\s+${method}\\s*\\(`).test(source))
          problems.push(`${where}: ${runner} has no test method ${method}`);
      }
    }
    if ((level === 'pending' || level === 'shape') && (issue === undefined || !roadmap.has(issue))) {
      problems.push(`${where}: php.issue must be a roadmap issue (BWB-nnn) while the PHP side is ${level}`);
    }
  }
  for (const file of findOrphans(sharedDataFiles(), covered)) {
    problems.push(`${file} is not part of any contract suite (add it to tests/fixtures/contracts.json)`);
  }
  return problems;
}
