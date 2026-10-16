import { useEffect, useState } from 'react';
import type { MediaItem } from '../api/types';
import { useMediaServices } from './MediaContext';
import { MediaDialog } from './MediaDialog';
import { useI18n } from '../i18n-react';

export function MediaField({
  label,
  emptyText = 'No image selected',
  idLabel,
  value,
  disabled = false,
  onSelect,
  onRemove,
  fallbackId,
  onFallbackId,
}: {
  label: string;
  emptyText?: string;
  idLabel?: string;
  value: MediaItem | null;
  disabled?: boolean;
  onSelect: (item: MediaItem) => void;
  onRemove?: () => void;
  fallbackId?: number | null;
  onFallbackId?: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { client, canUpload } = useMediaServices();
  const idDisclosureLabel = idLabel ?? t('page.imageId');
  const [resolved, setResolved] = useState<{ id: number; item: MediaItem } | null>(null);
  const fallback = value?.id ?? fallbackId ?? null;
  useEffect(() => {
    if (!fallback || (value?.url ?? '') !== '') return;
    let active = true;
    void client.get(fallback).then((result) => {
      if (active && result.ok) setResolved({ id: fallback, item: result.value });
    });
    return () => {
      active = false;
    };
  }, [client, fallback, value?.url]);
  const preview = value?.url ? value : fallback === resolved?.id ? resolved.item : null;
  return (
    <div className="blx-media-field">
      <span className="sr-only">{label}</span>
      <div className="blx-media-field-preview">
        {preview?.url ? <img src={preview.thumbUrl || preview.url} alt="" /> : <span aria-hidden="true">▧</span>}
        <div>
          <strong>
            {preview && preview.title !== '' ? preview.title : (preview?.url.split('/').pop() ?? emptyText)}
          </strong>
          {preview?.alt ? <small>{t('media.alt', { alt: preview.alt })}</small> : null}
        </div>
      </div>
      <div className="blx-media-field-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
          }}
        >
          {value ? t('media.replace') : t('media.choose')}
        </button>
        {value || fallbackId ? (
          <button type="button" disabled={disabled} onClick={onRemove}>
            {t('media.remove')}
          </button>
        ) : null}
      </div>
      {onFallbackId ? (
        <details className="blx-media-id-disclosure">
          <summary>{t('page.useAttachmentId')}</summary>
          <label>
            {idDisclosureLabel}
            <input
              type="number"
              min={1}
              disabled={disabled}
              value={fallbackId ?? ''}
              onChange={(event) => {
                const id = Number(event.currentTarget.value);
                onFallbackId(id > 0 ? id : null);
              }}
            />
          </label>
        </details>
      ) : null}
      <MediaDialog open={open} onOpenChange={setOpen} client={client} canUpload={canUpload} onUse={onSelect} />
    </div>
  );
}
