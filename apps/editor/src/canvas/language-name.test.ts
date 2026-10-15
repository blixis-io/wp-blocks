import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageName } from './language-name';

describe('languageName', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names a locale in the interface language', () => {
    expect(languageName('nl_NL', 'en-US')).toBe('Dutch (Netherlands)');
    expect(languageName('nl_NL', 'nl-NL')).toBe('Nederlands (Nederland)');
    expect(languageName('de_DE', 'nl-NL')).toBe('Duits (Duitsland)');
  });

  it('falls back to the id when the tag is invalid', () => {
    expect(languageName('not a locale', 'en-US')).toBe('not a locale');
    expect(languageName('', 'en-US')).toBe('');
  });

  it('falls back to the id without Intl.DisplayNames, or when it throws or has no name', () => {
    vi.stubGlobal('Intl', {});
    expect(languageName('nl_NL', 'en-US')).toBe('nl_NL');
    vi.stubGlobal('Intl', {
      DisplayNames: class {
        of(): undefined {
          return undefined;
        }
      },
    });
    expect(languageName('nl_NL', 'en-US')).toBe('nl_NL');
    vi.stubGlobal('Intl', {
      DisplayNames: function () {
        throw new RangeError('bad');
      },
    });
    expect(languageName('nl_NL', 'en-US')).toBe('nl_NL');
  });
});
