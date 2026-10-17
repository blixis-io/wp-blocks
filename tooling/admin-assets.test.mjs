import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asciiFilename,
  mediaApiUrl,
  mediaEditUrl,
  mediaQuery,
  safeMediaUrl,
  validMedia,
} from '../wordpress/plugin/assets/admin/assets-core.js';

test('asset filename is ASCII and safe for Content-Disposition', () => {
  const name = asciiFilename('résumé ";\n.png');
  assert.match(name, /^[A-Za-z0-9._-]+$/);
  assert.equal(name.includes('"'), false);
  assert.equal(asciiFilename('你好'), 'upload');
});

test('media URLs must be same-origin HTTP(S)', () => {
  assert.equal(safeMediaUrl('/wp-content/a.png', 'https://example.test'), 'https://example.test/wp-content/a.png');
  assert.equal(safeMediaUrl('javascript:alert(1)', 'https://example.test'), null);
  assert.equal(safeMediaUrl('https://elsewhere.test/a.png', 'https://example.test'), null);
});

test('edit links target the core media edit screen on the same origin', () => {
  assert.equal(
    mediaEditUrl('https://example.test/wp-admin/post.php', 7, 'https://example.test'),
    'https://example.test/wp-admin/post.php?post=7&action=edit',
  );
  assert.equal(mediaEditUrl('https://elsewhere.test/wp-admin/post.php', 7, 'https://example.test'), null);
  assert.equal(mediaEditUrl('https://example.test/wp-admin/post.php', 0, 'https://example.test'), null);
});

test('media API queries work with pretty and plain-permalink REST URLs', () => {
  const query = mediaQuery({ type: 'image', page: 2 });
  assert.equal(
    mediaApiUrl('https://example.test/wp-json/wp/v2/media', query, 'https://example.test'),
    `https://example.test/wp-json/wp/v2/media?${query}`,
  );
  const plain = new URL(
    mediaApiUrl('https://example.test/?rest_route=%2Fwp%2Fv2%2Fmedia', query, 'https://example.test'),
  );
  assert.equal(plain.searchParams.get('rest_route'), '/wp/v2/media');
  assert.equal(plain.searchParams.get('media_type'), 'image');
  assert.equal(mediaApiUrl('https://foreign.test/wp-json/wp/v2/media', query, 'https://example.test'), null);
});

test('media response validator refuses malformed and hostile URLs', () => {
  const value = {
    id: 4,
    title: { rendered: '<img onerror=x>' },
    mime_type: 'image/png',
    media_type: 'image',
    alt_text: '',
    source_url: 'https://example.test/a.png',
    link: 'https://example.test/?attachment_id=4',
    media_details: { sizes: { medium: { source_url: 'https://example.test/a-small.png' } } },
  };
  assert.equal(validMedia(value, 'https://example.test'), true);
  assert.equal(validMedia({ ...value, source_url: 'https://evil.test/a.png' }, 'https://example.test'), false);
  assert.equal(validMedia({ ...value, id: '4' }, 'https://example.test'), false);
});

test('query builder limits result size and constrains sort and media type', () => {
  const query = new URLSearchParams(mediaQuery({ type: 'image', search: 'hero', sort: 'title', page: 3 }));
  assert.equal(query.get('per_page'), '24');
  assert.equal(query.get('page'), '3');
  assert.equal(query.get('orderby'), 'title');
  assert.equal(query.get('media_type'), 'image');
  assert.equal(query.get('search'), 'hero');
  assert.equal(new URLSearchParams(mediaQuery({ sort: 'nonsense' })).get('orderby'), 'date');
  assert.equal(new URLSearchParams(mediaQuery({ type: 'svg', page: -3 })).has('media_type'), false);
  assert.equal(new URLSearchParams(mediaQuery({ type: 'svg', page: -3 })).get('page'), '1');
});
