import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n-react';
import { loadErrorMessageKey } from './load-error';
import { useEditorStore, useEditorStoreApi } from './state';

/**
 * Load failure and retry progress, rendered in the main region so it is visible whatever the side panels do (collapsed,
 * stacked off-screen). The Retry button stays mounted until the load actually starts, then focus moves to the loading status
 * text, and back to the alert if the retry fails again, so keyboard and screen reader users never lose their place.
 */
export function LoadStatus() {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const [retrying, setRetrying] = useState(false);
  const loadingRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const focusPending = useRef(false);

  useEffect(() => {
    if (!focusPending.current) return;
    if (status === 'loading') loadingRef.current?.focus();
    else if (status === 'error') alertRef.current?.focus();
    if (status !== 'loading') focusPending.current = false;
  }, [status]);

  if (status === 'error' && error !== null) {
    return (
      <div role="alert" tabIndex={-1} ref={alertRef} className="blx-load-error" data-testid="load-error">
        <p className="font-medium">{t('load.error.title')}</p>
        <p>{t(loadErrorMessageKey(error))}</p>
        <button
          type="button"
          className="ed-focus-ring underline"
          onClick={() => {
            focusPending.current = true;
            setRetrying(true);
            void store.getState().loadDocument();
          }}
        >
          {t('load.retry')}
        </button>
      </div>
    );
  }
  if (retrying && status === 'loading') {
    return (
      <p role="status" tabIndex={-1} ref={loadingRef} className="blx-empty" data-testid="load-retrying">
        {t('panel.structure.loading')}
      </p>
    );
  }
  return null;
}
