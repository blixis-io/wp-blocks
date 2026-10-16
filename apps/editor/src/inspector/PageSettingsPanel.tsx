import { useEffect, useMemo } from 'react';
import { Icon, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@blixis/wp-editor-ui';
import { InspectorSection } from './InspectorSection';
import { useEditorStore, useEditorStoreApi } from '../state';
import { useI18n } from '../i18n-react';
import { languageName } from '../canvas/language-name';
import { MediaField } from '../media/MediaField';
import type { MediaItem } from '../api/types';
import { useState } from 'react';

function trimPreview(value: string, maximum: number): string {
  const clean = value.trim();
  return clean.length > maximum ? `${clean.slice(0, maximum - 1).trimEnd()}…` : clean;
}

function contentLocaleName(locale: string, uiLocale: string): string {
  const [language, region] = locale.split('_');
  const languageLabel = languageName(language ?? locale, uiLocale);
  if (!region) return languageLabel;
  try {
    const regionLabel = new Intl.DisplayNames([uiLocale], { type: 'region' }).of(region);
    return regionLabel ? `${languageLabel} (${regionLabel})` : languageLabel;
  } catch {
    return languageLabel;
  }
}

export function PageSettingsPanel({ editingEnabled }: { editingEnabled: boolean }) {
  const { t, locale: editorLocale } = useI18n();
  const store = useEditorStoreApi();
  const page = useEditorStore((state) => state.pageSettings);
  const savedPage = useEditorStore((state) => state.pageSettingsSaved);
  const status = useEditorStore((state) => state.pageSettingsStatus);
  const errors = useEditorStore((state) => state.pageSettingsFieldErrors);
  const locale = useEditorStore((state) => state.contentLocale);
  const bootstrap = useEditorStore((state) => state.bootstrap);
  const [ogImage, setOgImage] = useState<MediaItem | null>(null);
  const localeSeo = page?.seo[locale] ?? {
    metaTitle: '',
    metaDescription: '',
    ogTitle: '',
    ogDescription: '',
    ogImageId: null,
    noindex: false,
    nofollow: false,
    canonical: '',
  };
  useEffect(() => {
    void store.getState().loadPageSettings();
  }, [store]);
  const permalinkPrefix = useMemo(() => {
    const base = bootstrap.viewUrl ? new URL(bootstrap.viewUrl) : new URL('/', globalThis.location.origin);
    const basePath = base.pathname.replace(/\/+$/, '').replace(/[^/]+$/, '');
    return `${base.origin}${basePath}`;
  }, [bootstrap.viewUrl]);
  const slugPrefix = useMemo(() => `${new URL(permalinkPrefix).host}/`, [permalinkPrefix]);
  const metaTitle = localeSeo.metaTitle.length > 0 ? localeSeo.metaTitle : (page?.title ?? '');
  const metaDescription = localeSeo.metaDescription.length > 0 ? localeSeo.metaDescription : (page?.excerpt ?? '');
  if (status === 'loading' || !page)
    return (
      <p className="blx-empty" role="status">
        {status === 'failed' ? t('page.loadError') : t('page.loading')}
      </p>
    );
  const editable = editingEnabled && !bootstrap.seoPluginActive;
  const updateSeo = (key: keyof typeof localeSeo, value: string | boolean | number | null) => {
    store.getState().updatePageSettings({ seo: { [locale]: { ...localeSeo, [key]: value } } });
  };
  const field = (key: string) => `page-${key}-error`;
  const getError = (key: string) => errors[key] ?? errors[`seo.${locale}.${key}`];
  const describedBy = (key: string, ...ids: string[]) =>
    [...ids, getError(key) ? field(key) : ''].filter(Boolean).join(' ') || undefined;
  const error = (key: string) =>
    getError(key) ? (
      <p id={field(key)} role="alert" className="blx-inspector-error">
        <Icon name="info" size={14} /> <span>{getError(key)}</span>
      </p>
    ) : null;
  const counter = (key: string, value: string, max: number, recommendation?: string) => (
    <p id={`page-${key}-count`} className="blx-inspector-hint" aria-live="polite">
      {value.length}/{max}
      {recommendation ? ` · ${recommendation}` : ''}
    </p>
  );
  return (
    <div className="blx-inspector-sections blx-page-settings">
      <InspectorSection id="page-settings" title={t('page.section')}>
        <div className="blx-inspector-field">
          <div className="blx-inspector-field-label">
            <label htmlFor="page-title">{t('page.title')}</label>
            {counter('title', page.title, 200)}
          </div>
          <input
            id="page-title"
            maxLength={200}
            disabled={!editingEnabled}
            aria-describedby={describedBy('title', 'page-title-count')}
            value={page.title}
            onChange={(event) => {
              store.getState().updatePageSettings({ title: event.target.value });
            }}
          />
          {error('title')}
        </div>
        <div className="blx-inspector-field">
          <div className="blx-inspector-field-label">
            <label htmlFor="page-slug">{t('page.slug')}</label>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="blx-page-slug-group"
                  role="group"
                  aria-label={`${permalinkPrefix}${page.slug}/`}
                  tabIndex={-1}
                  dir="ltr"
                >
                  <span className="blx-page-slug-prefix" aria-hidden="true">
                    {slugPrefix}
                  </span>
                  <input
                    id="page-slug"
                    dir="ltr"
                    maxLength={200}
                    disabled={!editingEnabled}
                    aria-describedby={describedBy(
                      'slug',
                      ...(page.status === 'publish' && page.slug !== savedPage?.slug ? ['page-slug-hint'] : []),
                    )}
                    value={page.slug}
                    onChange={(event) => {
                      store.getState().updatePageSettings({
                        slug: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_\-\s]/g, '')
                          .trim()
                          .replace(/[\s_]+/g, '-'),
                      });
                    }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>{`${permalinkPrefix}${page.slug}/`}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {page.status === 'publish' && page.slug !== savedPage?.slug ? (
            <p id="page-slug-hint" className="blx-inspector-hint">
              {t('page.publishedSlugHint')}
            </p>
          ) : null}
          {error('slug')}
        </div>
        <div className="blx-page-status-row">
          <span>{t('page.statusLabel')}</span>
          <span className={`blx-page-status is-${page.status}`}>
            <i aria-hidden="true" />
            {t(`page.status.${page.status}` as never)}
          </span>
        </div>
        <div className="blx-inspector-field">
          <div className="blx-inspector-field-label">
            <label htmlFor="page-excerpt">{t('page.excerpt')}</label>
            {counter('excerpt', page.excerpt, 1000)}
          </div>
          <textarea
            id="page-excerpt"
            maxLength={1000}
            rows={4}
            disabled={!editingEnabled}
            value={page.excerpt}
            onChange={(event) => {
              store.getState().updatePageSettings({ excerpt: event.target.value });
            }}
          />
          {error('excerpt')}
        </div>
      </InspectorSection>
      <InspectorSection id="page-featured-image" title={t('page.featuredImage')}>
        <MediaField
          label={t('page.featuredImage')}
          emptyText={t('page.noImageTitle')}
          disabled={!editingEnabled}
          value={
            page.featuredImage
              ? {
                  id: page.featuredImage.id,
                  url: page.featuredImage.url,
                  thumbUrl: page.featuredImage.url,
                  alt: page.featuredImage.alt,
                  title: '',
                  width: page.featuredImage.width,
                  height: page.featuredImage.height,
                  mime: 'image',
                }
              : null
          }
          fallbackId={page.featuredImage?.id ?? null}
          onSelect={(item) => {
            store.getState().updatePageSettings({
              featuredImage: { id: item.id, url: item.url, alt: item.alt, width: item.width, height: item.height },
            });
          }}
          onRemove={() => {
            store.getState().updatePageSettings({ featuredImage: null });
          }}
          onFallbackId={(id) => {
            store
              .getState()
              .updatePageSettings({ featuredImage: id ? { id, url: '', alt: '', width: 0, height: 0 } : null });
          }}
        />
      </InspectorSection>
      <InspectorSection id="page-seo" title={t('page.seo')}>
        <div className="blx-page-locale-notice" role="note">
          <span>{t('page.localeNotice', { language: contentLocaleName(locale, editorLocale.replace('_', '-')) })}</span>
          <span className="blx-page-locale-chip">
            {t('page.editingLocale', { locale, language: languageName(locale, editorLocale.replace('_', '-')) })}
          </span>
        </div>
        {bootstrap.seoPluginActive ? <p role="note">{t('page.seoPluginNote')}</p> : null}
        <div className="blx-inspector-field">
          <div className="blx-inspector-field-label">
            <label htmlFor="seo-meta-title">{t('page.metaTitle')}</label>
            {counter('meta-title', localeSeo.metaTitle, 120, t('page.recommendedTitle'))}
          </div>
          <input
            id="seo-meta-title"
            maxLength={120}
            disabled={!editable}
            aria-describedby={describedBy('metaTitle', 'page-meta-title-count')}
            value={localeSeo.metaTitle}
            onChange={(event) => {
              updateSeo('metaTitle', event.target.value);
            }}
          />
          {error('metaTitle')}
        </div>
        <div className="blx-inspector-field">
          <div className="blx-inspector-field-label">
            <label htmlFor="seo-meta-description">{t('page.metaDescription')}</label>
            {counter('meta-description', localeSeo.metaDescription, 320, t('page.recommendedDescription'))}
          </div>
          <textarea
            id="seo-meta-description"
            maxLength={320}
            rows={4}
            disabled={!editable}
            aria-describedby={describedBy('metaDescription', 'page-meta-description-count')}
            value={localeSeo.metaDescription}
            onChange={(event) => {
              updateSeo('metaDescription', event.target.value);
            }}
          />
          {error('metaDescription')}
        </div>
        <div className="blx-search-preview" aria-label={t('page.searchPreview')}>
          <div className="blx-preview-site-name">
            {(bootstrap.viewUrl ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
          </div>
          <p className="blx-preview-url">
            {(bootstrap.viewUrl ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')} › {page.slug}
          </p>
          <strong>{trimPreview(metaTitle, 60)}</strong>
          <span className={!metaDescription ? 'is-placeholder' : undefined}>
            {trimPreview(metaDescription, 160) || t('page.noDescription')}
          </span>
        </div>
        <p className="blx-page-robots-explanation">{t('page.robotsExplanation')}</p>
        <div className="blx-page-robots-list">
          {(['noindex', 'nofollow'] as const).map((key) => (
            <div className="blx-page-robot-row" key={key}>
              <span className="blx-page-robot-copy">
                <span>{t(`page.${key}`)}</span>
                <small>{t(`page.${key}Hint`)}</small>
              </span>
              <input
                className="blx-page-robot-switch"
                id={`seo-${key}`}
                aria-label={t(`page.${key}`)}
                role="switch"
                type="checkbox"
                disabled={!editable}
                checked={localeSeo[key]}
                onChange={(event) => {
                  updateSeo(key, event.target.checked);
                }}
              />
            </div>
          ))}
        </div>
        <div className="blx-inspector-field">
          <div className="blx-inspector-field-label">
            <label htmlFor="seo-canonical">{t('page.canonical')}</label>
          </div>
          <input
            id="seo-canonical"
            type="url"
            disabled={!editable}
            aria-describedby={describedBy('canonical', 'seo-canonical-hint')}
            value={localeSeo.canonical}
            onChange={(event) => {
              updateSeo('canonical', event.target.value);
            }}
          />
          <p id="seo-canonical-hint" className="blx-inspector-hint">
            {t('page.sameOriginHint')}
          </p>
          {error('canonical')}
        </div>
        <InspectorSection id="page-social" title={t('page.social')} defaultCollapsed>
          <div className="blx-share-preview">
            <div className="blx-share-image">
              {page.featuredImage ? (
                <img src={page.featuredImage.url} alt="" />
              ) : (
                <span>{t('page.shareImagePlaceholder')}</span>
              )}
            </div>
            <p className="blx-preview-url">
              {(bootstrap.viewUrl ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
            </p>
            <strong>{trimPreview(localeSeo.ogTitle || metaTitle, 60)}</strong>
            <span>{trimPreview(localeSeo.ogDescription || metaDescription, 160)}</span>
          </div>
          <div className="blx-inspector-field">
            <label htmlFor="seo-og-title">{t('page.ogTitle')}</label>
            <input
              id="seo-og-title"
              maxLength={120}
              disabled={!editable}
              value={localeSeo.ogTitle}
              onChange={(event) => {
                updateSeo('ogTitle', event.target.value);
              }}
            />
          </div>
          <div className="blx-inspector-field">
            <label htmlFor="seo-og-description">{t('page.ogDescription')}</label>
            <textarea
              id="seo-og-description"
              maxLength={320}
              rows={3}
              disabled={!editable}
              value={localeSeo.ogDescription}
              onChange={(event) => {
                updateSeo('ogDescription', event.target.value);
              }}
            />
          </div>
          <MediaField
            label={t('page.ogImageId')}
            emptyText={t('page.noImageTitle')}
            disabled={!editable}
            value={ogImage?.id === localeSeo.ogImageId ? ogImage : null}
            fallbackId={localeSeo.ogImageId}
            onSelect={(item) => {
              setOgImage(item);
              updateSeo('ogImageId', item.id);
            }}
            onRemove={() => {
              setOgImage(null);
              updateSeo('ogImageId', null);
            }}
            onFallbackId={(id) => {
              updateSeo('ogImageId', id);
            }}
          />
        </InspectorSection>
      </InspectorSection>
    </div>
  );
}
