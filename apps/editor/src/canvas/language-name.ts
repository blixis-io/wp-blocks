/**
 * The display name of a WordPress locale id (`nl_NL`) in the editor interface language, from the browser's `Intl.DisplayNames`
 * (no names are hard-coded). The id itself is the fallback when the browser has no name for it or does not support the API.
 */
export function languageName(localeId: string, uiLanguageTag: string): string {
  try {
    const tag = localeId.replace(/_/g, '-');
    const name = new Intl.DisplayNames([uiLanguageTag], { type: 'language' }).of(tag);
    return name === undefined || name === '' || name === tag ? localeId : name;
  } catch {
    return localeId;
  }
}
