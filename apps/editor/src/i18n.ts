import { en_US, type MessageKey } from './messages/en_US';
import { nl_NL } from './messages/nl_NL';

export type { MessageKey } from './messages/en_US';

/** Message catalogs by locale id. Add a catalog here; missing keys fall back to `en_US` per key. */
export const CATALOGS: Readonly<Record<string, Readonly<Partial<Record<MessageKey, string>>>>> = {
  en_US,
  nl_NL,
};

const DEFAULT_LOCALE = 'en_US';
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'he', 'fa', 'ur']);

export type TranslateParams = Readonly<Record<string, string | number>>;

export interface Translator {
  /** Catalog actually used for the text (for example `nl_NL` for a requested `nl_BE`). */
  readonly locale: string;
  /** BCP 47 tag of the displayed text, for the `lang` attribute. */
  readonly lang: string;
  /** Direction of the editor interface, derived from the requested editor locale only. */
  readonly dir: 'ltr' | 'rtl';
  t: (key: MessageKey, params?: TranslateParams) => string;
}

function normalise(locale: string): string {
  return locale.trim().replace(/-/g, '_');
}

function languageOf(locale: string): string {
  return normalise(locale).split('_')[0]?.toLowerCase() ?? '';
}

/** Exact match first (case-insensitive), then the first catalog of the same language, then `en_US`. */
export function resolveCatalogLocale(requested: string): string {
  const wanted = normalise(requested).toLowerCase();
  const ids = Object.keys(CATALOGS);
  const exact = ids.find((id) => id.toLowerCase() === wanted);
  if (exact) return exact;
  const language = languageOf(requested);
  return ids.find((id) => languageOf(id) === language) ?? DEFAULT_LOCALE;
}

export function directionOf(locale: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(languageOf(locale)) ? 'rtl' : 'ltr';
}

/** Replaces `{name}` placeholders; unknown placeholders stay visible so a missing parameter is noticed. */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(editorLocale: string): Translator {
  const locale = resolveCatalogLocale(editorLocale);
  const catalog = CATALOGS[locale] ?? en_US;
  const fallback: Readonly<Partial<Record<string, string>>> = en_US;
  return {
    locale,
    lang: locale.replace(/_/g, '-'),
    dir: directionOf(editorLocale),
    t: (key, params) => interpolate(catalog[key] ?? fallback[key] ?? key, params),
  };
}
