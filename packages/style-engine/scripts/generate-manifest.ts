// Generates manifest/css-properties.json: the allow-list the PHP twin of the CSS validator implements (BWB-023, BWB-027).
// `--check` fails if the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@blixis/wp-core';
import { CSS_LIMITS } from '../src/limits.ts';
import {
  ANGLE_UNITS,
  COLOR_ARG_IDENTS,
  COLOR_FUNCTIONS,
  EASING_FUNCTIONS,
  EASING_KEYWORDS,
  GRADIENT_ARG_IDENTS,
  GRADIENT_FUNCTIONS,
  LENGTH_UNITS,
  MATH_FUNCTIONS,
  NAMED_COLORS,
  PROPERTIES,
  TIME_UNITS,
  TRACK_ARG_IDENTS,
  TRACK_FUNCTIONS,
  TRANSFORM_FUNCTIONS,
  WIDE_KEYWORDS,
} from '../src/properties.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'manifest', 'css-properties.json');

export function generate(): string {
  const manifest = {
    limits: CSS_LIMITS,
    wideKeywords: WIDE_KEYWORDS,
    units: { length: LENGTH_UNITS, angle: ANGLE_UNITS, time: TIME_UNITS, flex: ['fr'] },
    functions: {
      math: MATH_FUNCTIONS,
      color: COLOR_FUNCTIONS,
      gradient: GRADIENT_FUNCTIONS,
      track: TRACK_FUNCTIONS,
      transform: TRANSFORM_FUNCTIONS,
      easing: EASING_FUNCTIONS,
      var: ['var'],
    },
    identifiers: {
      color: COLOR_ARG_IDENTS,
      gradient: GRADIENT_ARG_IDENTS,
      track: TRACK_ARG_IDENTS,
      easing: EASING_KEYWORDS,
    },
    namedColors: NAMED_COLORS,
    customPropertyPattern: '^--blx-[a-z0-9-]{1,64}$',
    properties: Object.fromEntries(PROPERTIES),
  };
  // Canonical JSON (sorted keys) re-indented for review: identical on every machine and in PHP.
  return `${JSON.stringify(JSON.parse(canonicalJson(JSON.parse(JSON.stringify(manifest)))), null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) {
      console.error(
        'manifest/css-properties.json is stale: run `pnpm --filter @blixis/wp-style-engine manifest:generate`',
      );
      process.exit(1);
    }
    console.log('css-properties.json is up to date');
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${target}`);
  }
}
