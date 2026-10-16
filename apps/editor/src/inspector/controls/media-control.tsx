import type { FieldControlProps } from './field-types';
import { MediaField } from '../../media/MediaField';
import type { MediaItem } from '../../api/types';
import { useI18n } from '../../i18n-react';

export function MediaControl({
  definition,
  draft,
  disabled,
  onDraft,
  onCommit,
  name,
  value,
  onMediaPick,
}: FieldControlProps) {
  const { t } = useI18n();
  if (definition.kind !== 'media') return null;
  const idValue = typeof value === 'number' ? value : Number(draft) || null;
  const picked = (item: MediaItem) => {
    onDraft(String(item.id));
    onCommit(item.id);
    onMediaPick?.(item);
  };
  return (
    <MediaField
      label={name}
      emptyText={t('inspector.media.later')}
      idLabel={t('inspector.mediaId')}
      disabled={disabled}
      value={null}
      fallbackId={idValue}
      onSelect={picked}
      onRemove={() => {
        onDraft('');
        onCommit(null);
      }}
      onFallbackId={(id) => {
        onDraft(id ? String(id) : '');
        onCommit(id);
      }}
    />
  );
}
