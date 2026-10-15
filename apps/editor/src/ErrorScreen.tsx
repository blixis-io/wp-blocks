import { createTranslator } from './i18n';

/** Shown when the bootstrap is missing or invalid. It deliberately shows no detail about what was wrong. */
export function ErrorScreen({ editorLocale = 'en_US' }: { editorLocale?: string }) {
  const { t, lang, dir } = createTranslator(editorLocale);
  return (
    <div className="blx-editor blx-error" data-editor-theme="light" lang={lang} dir={dir}>
      <div role="alert">
        <h1 className="text-lg font-semibold">{t('error.title')}</h1>
        <p>{t('error.body')}</p>
      </div>
    </div>
  );
}
