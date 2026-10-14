import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFixtureValue, type Json } from './canonical.ts';

/** Absolute path of the fixtures directory (`tests/fixtures`). */
export const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every fixture file is an envelope so tests, tools and PHP read them the same way. */
export interface Fixture {
  fixtureVersion: 1;
  /** Kebab-case, equal to the file name without `.fixture.json`. */
  id: string;
  description: string;
  /** Free-form labels such as `translation`, `dark-mode`, `hostile`. */
  tags: string[];
  input: Json;
  /** The expected result: a value, or `{ "error": "<code>" }` for invalid inputs. */
  expected: Json;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFixture(text: string, file: string): Fixture {
  if (text.includes('\r')) throw new Error(`${file}: fixtures must use LF line endings`);
  if (!text.endsWith('\n') || text.endsWith('\n\n'))
    throw new Error(`${file}: fixtures must end with exactly one newline`);
  const raw: unknown = JSON.parse(text);
  assertFixtureValue(raw);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(`${file}: a fixture must be a JSON object`);
  const f = raw as Record<string, unknown>;
  const expectedKeys = ['description', 'expected', 'fixtureVersion', 'id', 'input', 'tags'];
  const keys = Object.keys(f).sort();
  if (keys.join() !== expectedKeys.join())
    throw new Error(`${file}: keys must be exactly ${expectedKeys.join(', ')} (got ${keys.join(', ')})`);
  if (f['fixtureVersion'] !== 1) throw new Error(`${file}: fixtureVersion must be 1`);
  if (typeof f['id'] !== 'string' || !ID.test(f['id'])) throw new Error(`${file}: id must be kebab-case`);
  if (f['id'] !== basename(file).replace(/\.fixture\.json$/, ''))
    throw new Error(`${file}: id "${f['id']}" must equal the file name`);
  if (typeof f['description'] !== 'string' || f['description'].trim() === '')
    throw new Error(`${file}: description is required`);
  if (!Array.isArray(f['tags']) || !f['tags'].every((t): t is string => typeof t === 'string' && ID.test(t)))
    throw new Error(`${file}: tags must be kebab-case strings`);
  return raw as unknown as Fixture;
}

/** Absolute paths of all `*.fixture.json` files below `dir`, sorted. */
export function listFixtureFiles(dir: string = FIXTURES_ROOT): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.fixture.json')) out.push(path);
    }
  };
  walk(dir);
  return out;
}

export function loadFixture(path: string): Fixture {
  return parseFixture(readFileSync(path, 'utf8'), relative(FIXTURES_ROOT, path));
}

/** All fixtures, validated, with ids guaranteed unique across the whole tree. */
export function loadAllFixtures(dir: string = FIXTURES_ROOT): Fixture[] {
  const seen = new Map<string, string>();
  return listFixtureFiles(dir).map((file) => {
    const fixture = loadFixture(file);
    const previous = seen.get(fixture.id);
    if (previous !== undefined)
      throw new Error(`duplicate fixture id "${fixture.id}" in ${relative(dir, file)} and ${previous}`);
    seen.set(fixture.id, relative(dir, file));
    return fixture;
  });
}
