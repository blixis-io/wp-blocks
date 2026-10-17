export function asciiFilename(value) {
  const clean = String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return clean || 'upload';
}

export function safeMediaUrl(value, origin = globalThis.location?.origin) {
  try {
    const url = new URL(value, origin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === origin && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function mediaEditUrl(base, id, origin = globalThis.location?.origin) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const safeBase = safeMediaUrl(base, origin);
  if (!safeBase) return null;
  const url = new URL(safeBase);
  url.searchParams.set('post', String(id));
  url.searchParams.set('action', 'edit');
  return url.href;
}

export function mediaApiUrl(base, query, origin = globalThis.location?.origin) {
  const safeBase = safeMediaUrl(base, origin);
  if (!safeBase) return null;
  const url = new URL(safeBase);
  for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value);
  return url.href;
}

export function validMedia(item, origin = globalThis.location?.origin) {
  if (
    !item ||
    !Number.isSafeInteger(item.id) ||
    item.id < 1 ||
    typeof item.title?.rendered !== 'string' ||
    item.title.rendered.length > 1000 ||
    typeof item.alt_text !== 'string' ||
    item.alt_text.length > 5000 ||
    typeof item.mime_type !== 'string' ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(item.mime_type) ||
    !['image', 'audio', 'video', 'application'].includes(item.media_type)
  )
    return false;
  if (!safeMediaUrl(item.source_url, origin) || !safeMediaUrl(item.link, origin)) return false;
  const details = item.media_details;
  if (details && (typeof details !== 'object' || Array.isArray(details))) return false;
  if (details?.filesize !== undefined && (!Number.isSafeInteger(details.filesize) || details.filesize < 0))
    return false;
  if (details?.width !== undefined && (!Number.isSafeInteger(details.width) || details.width < 0)) return false;
  if (details?.height !== undefined && (!Number.isSafeInteger(details.height) || details.height < 0)) return false;
  if (!details?.sizes) return true;
  if (typeof details.sizes !== 'object' || Array.isArray(details.sizes) || Object.keys(details.sizes).length > 50)
    return false;
  return Object.values(details.sizes).every(
    (size) =>
      size &&
      typeof size === 'object' &&
      (size.source_url === undefined || safeMediaUrl(size.source_url, origin)) &&
      (size.width === undefined || Number.isSafeInteger(size.width)) &&
      (size.height === undefined || Number.isSafeInteger(size.height)),
  );
}

export function mediaQuery({ type = 'all', search = '', sort = 'date', page = 1 } = {}) {
  const mediaType = ['image', 'audio', 'video', 'application'].includes(type) ? type : 'all';
  const pageNumber = Number.isSafeInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const params = new URLSearchParams({
    per_page: '24',
    page: String(pageNumber),
    order: 'desc',
    orderby: sort === 'title' ? 'title' : 'date',
  });
  if (search.trim()) params.set('search', search.trim());
  if (mediaType !== 'all') params.set('media_type', mediaType);
  return params.toString();
}
