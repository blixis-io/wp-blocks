import { describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator, directionOf, interpolate, resolveCatalogLocale } from './i18n';
import { en_US } from './messages/en_US';

describe('catalogs', () => {
  it('nl_NL covers every key of en_US', () => {
    expect(Object.keys(CATALOGS['nl_NL'] ?? {}).sort()).toEqual(Object.keys(en_US).sort());
  });
  it('messages contain no HTML', () => {
    for (const catalog of Object.values(CATALOGS)) {
      for (const message of Object.values(catalog)) expect(message).not.toMatch(/[<>]/);
    }
  });
});

describe('locale resolution', () => {
  it('selects exact, language-only and fallback locales', () => {
    expect(resolveCatalogLocale('nl_NL')).toBe('nl_NL');
    expect(resolveCatalogLocale('nl-nl')).toBe('nl_NL');
    expect(resolveCatalogLocale('nl_BE')).toBe('nl_NL');
    expect(resolveCatalogLocale('de_DE')).toBe('en_US');
    expect(resolveCatalogLocale('')).toBe('en_US');
  });
});

describe('translator', () => {
  it('translates and interpolates', () => {
    const nl = createTranslator('nl_BE');
    expect(nl.locale).toBe('nl_NL');
    expect(nl.lang).toBe('nl-NL');
    expect(nl.t('header.save')).toBe('Opslaan');
    expect(createTranslator('en_US').t('lock.banner', { reason: 'busy' })).toBe('Editing is disabled: busy');
  });

  it('falls back per key to en_US and finally to the key', () => {
    const translator = createTranslator('nl_NL');
    expect(translator.t('definitely.missing' as never)).toBe('definitely.missing');
  });

  it('keeps unknown placeholders visible and ignores prototype keys', () => {
    expect(interpolate('Hi {name} {other}', { name: 'Ann' })).toBe('Hi Ann {other}');
    expect(interpolate('{constructor}', {})).toBe('{constructor}');
    expect(interpolate('{n}', { n: 3 })).toBe('3');
  });

  it('derives direction from the editor locale only', () => {
    for (const locale of ['ar', 'he_IL', 'fa_IR', 'ur_PK']) expect(directionOf(locale)).toBe('rtl');
    expect(directionOf('nl_NL')).toBe('ltr');
    expect(createTranslator('ar').dir).toBe('rtl');
    expect(createTranslator('en_US').dir).toBe('ltr');
  });
});
