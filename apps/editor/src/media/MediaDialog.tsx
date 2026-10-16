import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@blixis/wp-editor-ui';
import type { MediaClient, MediaItem } from '../api/types';
import { useI18n } from '../i18n-react';

export function MediaDialog({
  open,
  onOpenChange,
  client,
  canUpload,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: MediaClient;
  canUpload: boolean;
  onUse: (item: MediaItem) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadStatuses, setUploadStatuses] = useState<
    { name: string; state: 'uploading' | 'uploaded' | 'error'; message?: string }[]
  >([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const itemCount = useRef(0);
  const load = useCallback(
    (query: string, nextPage: number, append: boolean) => {
      setLoading(true);
      setFailure('');
      void client
        .list({ search: query, page: nextPage })
        .then((result) => {
          if (!result.ok) {
            setFailure(t('media.loadError'));
            return;
          }
          const currentCount = append ? itemCount.current : 0;
          itemCount.current = currentCount + result.value.items.length;
          setActive(currentCount);
          if (!append) setSelected(null);
          setItems((current) => (append ? [...current, ...result.value.items] : result.value.items));
          setTotalPages(result.value.totalPages);
          setPage(nextPage);
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [client, t],
  );
  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = setTimeout(
      () => {
        load(search, 1, false);
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [load, open, search]);
  const upload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError('');
    setUploadStatuses(selectedFiles.map((file) => ({ name: file.name, state: 'uploading' })));
    for (const [index, file] of selectedFiles.entries()) {
      const result = await client.upload(file);
      if (result.ok) {
        itemCount.current += 1;
        setItems((current) => [result.value, ...current]);
        setSelected(result.value.id);
        setActive(0);
        setUploadStatuses((current) =>
          current.map((status, statusIndex) => (statusIndex === index ? { ...status, state: 'uploaded' } : status)),
        );
      } else {
        const message =
          result.error.code === 'media_file_too_large' || result.error.code === 'media_upload_too_large'
            ? t('media.uploadTooLarge')
            : result.error.code === 'media_unsupported_type'
              ? t('media.unsupportedType')
              : t('media.uploadError');
        setUploadStatuses((current) =>
          current.map((status, statusIndex) =>
            statusIndex === index ? { ...status, state: 'error', message } : status,
          ),
        );
      }
    }
    setUploading(false);
  };
  const confirm = () => {
    const item = items.find((entry) => entry.id === selected);
    if (item) {
      onUse(item);
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('media.title')}
        description={t('media.description')}
        closeLabel={t('media.close')}
        className="blx-media-dialog"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo.current?.isConnected) {
            event.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
      >
        <div className="blx-media-tools">
          <label htmlFor="blx-media-search">{t('media.search')}</label>
          <input
            id="blx-media-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          {canUpload ? (
            <>
              <button type="button" disabled={uploading} onClick={() => input.current?.click()}>
                {uploading ? t('media.uploading') : t('media.upload')}
              </button>
              <input
                ref={input}
                className="sr-only"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                aria-label={t('media.upload')}
                onChange={(event) => {
                  void upload(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
            </>
          ) : (
            <span role="note">{t('media.uploadDenied')}</span>
          )}
        </div>
        <div
          className="blx-media-drop"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (canUpload) void upload(event.dataTransfer.files);
          }}
        >
          {failure ? (
            <div role="alert">
              {failure}{' '}
              <button
                type="button"
                onClick={() => {
                  load(search, 1, false);
                }}
              >
                {t('media.retry')}
              </button>
            </div>
          ) : null}
          {uploadError ? <p role="alert">{uploadError}</p> : null}
          {uploadStatuses.length ? (
            <ul className="blx-media-upload-statuses">
              {uploadStatuses.map((status, index) => (
                <li key={`${status.name}-${String(index)}`} role={status.state === 'error' ? 'alert' : 'status'}>
                  {status.name}:{' '}
                  {status.message ?? (status.state === 'uploaded' ? t('media.uploaded') : t('media.uploading'))}
                </li>
              ))}
            </ul>
          ) : null}
          {items.length === 0 && !loading && !failure ? <p className="blx-media-empty">{t('media.empty')}</p> : null}
          <div
            role="listbox"
            tabIndex={0}
            aria-label={t('media.library')}
            aria-activedescendant={items[active] ? `blx-media-${String(items[active].id)}` : undefined}
            className="blx-media-grid"
            onKeyDown={(event) => {
              if (!items.length) return;
              if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length;
                const delta =
                  event.key === 'ArrowRight'
                    ? 1
                    : event.key === 'ArrowLeft'
                      ? -1
                      : event.key === 'ArrowDown'
                        ? columns
                        : -columns;
                const next = Math.max(0, Math.min(items.length - 1, active + delta));
                setActive(next);
                const nextItem = items[next];
                if (nextItem) document.getElementById(`blx-media-${String(nextItem.id)}`)?.focus();
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const item = items[active];
                if (!item) return;
                setSelected(item.id);
                if (event.key === 'Enter') {
                  onUse(item);
                  onOpenChange(false);
                }
              }
            }}
          >
            {items.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={selected === item.id}
                id={`blx-media-${String(item.id)}`}
                tabIndex={active === index ? 0 : -1}
                key={item.id}
                className="blx-media-card"
                onFocus={() => {
                  setActive(index);
                }}
                onClick={() => {
                  setSelected(item.id);
                }}
                onDoubleClick={() => {
                  setSelected(item.id);
                  onUse(item);
                  onOpenChange(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelected(item.id);
                    onUse(item);
                    onOpenChange(false);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelected(item.id);
                  }
                }}
              >
                <img src={item.thumbUrl} alt="" />
                <span>{item.title || item.url.split('/').pop()}</span>
                {selected === item.id ? <b aria-hidden="true">✓</b> : null}
              </button>
            ))}
          </div>
          {loading ? <p role="status">{t('media.loading')}</p> : null}
          {page < totalPages ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                load(search, page + 1, true);
              }}
            >
              {t('media.loadMore')}
            </button>
          ) : null}
          <p className="blx-media-drop-hint">{t('media.dropHint')}</p>
        </div>
        <footer className="blx-media-footer">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('media.cancel')}
          </button>
          <button type="button" className="ed-button-primary" disabled={selected === null} onClick={confirm}>
            {t('media.use')}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
