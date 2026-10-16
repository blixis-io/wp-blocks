import type { EditorBootstrap } from '../bootstrap';

export function makeBootstrap(overrides: Partial<EditorBootstrap> = {}): EditorBootstrap {
  return {
    version: 1,
    restRoot: `${location.origin}/wp-json/blixis/v1/`,
    wpRestRoot: `${location.origin}/wp-json/wp/v2/`,
    maxUploadBytes: 10 * 1024 * 1024,
    canUpload: true,
    nonce: 'abc123',
    postId: 42,
    postTitle: 'About us',
    postType: 'page',
    contentLocale: 'fr_FR',
    defaultLocale: 'en_US',
    enabledLocales: ['en_US', 'fr_FR'],
    editorLocale: 'en_US',
    pluginVersion: '0.1.0',
    themeName: 'Blixis',
    editingEnabled: true,
    seoPluginActive: false,
    lockReason: null,
    adminUrl: `${location.origin}/wp-admin/`,
    viewUrl: `${location.origin}/about/`,
    previewUrl: `${location.origin}/about/?blixis_preview=nonce`,
    cspNonce: 'dGVzdC1ub25jZS1mb3ItanNkb20=',
    ...overrides,
  };
}
