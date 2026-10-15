import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, type Translator } from './i18n';

const I18nContext = createContext<Translator>(createTranslator('en_US'));

/** Provides the EDITOR interface locale (bootstrap.editorLocale). The content locale never reaches this provider. */
export function I18nProvider({ editorLocale, children }: { editorLocale: string; children: ReactNode }) {
  const translator = useMemo(() => createTranslator(editorLocale), [editorLocale]);
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>;
}

export function useI18n(): Translator {
  return useContext(I18nContext);
}
