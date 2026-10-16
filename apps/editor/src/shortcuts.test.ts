import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutKeys } from './shortcuts';

const actions = Object.keys(SHORTCUTS) as (keyof typeof SHORTCUTS)[];
const platforms = ['MacIntel', 'Macintosh', 'iPhone', 'iPad', 'Win32', 'Linux x86_64', 'Windows', 'Android'];

describe('platform aware tooltip shortcuts', () => {
  it.each(actions.flatMap((action) => platforms.map((platform) => [action, platform] as const)))(
    '%s on %s',
    (action, platform) => {
      expect(shortcutKeys(action, platform)).toEqual(
        SHORTCUTS[action][/mac|iphone|ipad/i.test(platform) ? 'mac' : 'other'],
      );
    },
  );
  it('uses distinct chords for every registered action on each platform', () => {
    for (const platform of ['MacIntel', 'Win32']) {
      const chords = actions.map((action) => shortcutKeys(action, platform).join('+'));
      expect(new Set(chords).size).toBe(chords.length);
    }
  });
  it('keeps the registry ids and chords complete', () => {
    expect(actions).toEqual(['undo', 'redo', 'save', 'bold', 'italic', 'underline']);
    for (const chord of Object.values(SHORTCUTS)) {
      expect(chord.mac.length).toBeGreaterThan(1);
      expect(chord.other.length).toBeGreaterThan(1);
    }
  });
});
