/* global document */
import { asciiFilename, mediaApiUrl, mediaEditUrl, mediaQuery, safeMediaUrl, validMedia } from './assets-core.js';

const root = document.querySelector('.blx-assets');
if (root) {
  const config = JSON.parse(root.dataset.config || '{}');
  const api = config.rest;
  const nonce = config.nonce;
  const list = root.querySelector('[data-items]');
  const details = root.querySelector('[data-details]');
  const status = root.querySelector('[data-status]');
  const labels = config.labels || {};
  const message = (key, ...values) =>
    values.reduce((text, value) => text.replace(/%[1-2]?\$?[ds]/, String(value)), labels[key] || key);
  const search = root.querySelector('[data-search]');
  const sort = root.querySelector('[data-sort]');
  const file = root.querySelector('[data-file]');
  let type = 'all';
  let page = 1;
  let current = [];
  const say = (message) => {
    status.textContent = message;
  };
  const request = async (url, options = {}) => {
    if (typeof url !== 'string') throw new Error(labels.invalidUrl || '');
    const safeUrl = safeMediaUrl(url);
    if (!safeUrl) throw new Error(labels.invalidUrl || '');
    const response = await fetch(safeUrl, {
      ...options,
      credentials: 'same-origin',
      headers: { 'X-WP-Nonce': nonce, ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(message('requestFailed', response.status));
    return response;
  };
  const detail = (item) => {
    details.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = item.title.rendered;
    details.append(heading);
    const url = safeMediaUrl(item.source_url);
    const img = item.media_type === 'image' && url ? document.createElement('img') : null;
    if (img) {
      img.src = url;
      img.alt = item.alt_text || '';
      details.append(img);
    }
    const alt = document.createElement('label');
    alt.textContent = labels.altText || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.alt_text || '';
    input.readOnly = true;
    alt.append(input);
    details.append(alt);
    const meta = item.media_details || {};
    const info = document.createElement('p');
    info.textContent = [
      meta.filesize ? `${Math.round(meta.filesize / 1024)} KB` : '',
      meta.width && meta.height ? `${meta.width} × ${meta.height}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    details.append(info);
    if (url) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'button';
      copy.textContent = labels.copyUrl || '';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          say(labels.urlCopied || '');
        } catch {
          say(labels.copyError || '');
        }
      });
      details.append(copy);
    }
    const edit = mediaEditUrl(config.editBase, item.id);
    if (edit) {
      const link = document.createElement('a');
      link.href = edit;
      link.textContent = labels.editMedia || '';
      details.append(link);
    }
  };
  const render = (items) =>
    items.forEach((item) => {
      if (!validMedia(item)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.className = 'blx-assets__item';
      button.setAttribute('aria-label', item.title.rendered);
      const previewUrl =
        item.media_type === 'image'
          ? safeMediaUrl(item.media_details?.sizes?.medium?.source_url || item.source_url)
          : null;
      if (previewUrl) {
        const img = document.createElement('img');
        img.src = previewUrl;
        img.alt = '';
        img.loading = 'lazy';
        button.append(img);
      }
      const title = document.createElement('span');
      title.textContent = item.title.rendered || labels.untitled || '';
      button.append(title);
      const mime = document.createElement('small');
      mime.textContent = item.mime_type.split('/').pop().toUpperCase();
      button.append(mime);
      button.addEventListener('click', () => {
        list
          .querySelectorAll('[role="option"]')
          .forEach((option) => option.setAttribute('aria-selected', String(option === button)));
        detail(item);
      });
      list.append(button);
    });
  const load = async (append = false) => {
    if (!append) {
      page = 1;
      list.replaceChildren();
      current = [];
    }
    try {
      const response = await request(
        mediaApiUrl(api, mediaQuery({ type, search: search.value, sort: sort.value, page })),
      );
      const data = await response.json();
      if (!Array.isArray(data) || !data.every((item) => validMedia(item)))
        throw new Error(labels.invalidResponse || '');
      current = current.concat(data);
      render(data);
      say(message('loaded', current.length));
    } catch (error) {
      say(error.message);
    }
  };
  root.querySelectorAll('[data-type]').forEach((button) =>
    button.addEventListener('click', () => {
      type = button.dataset.type;
      root.querySelectorAll('[data-type]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab === button));
        tab.tabIndex = tab === button ? 0 : -1;
      });
      load();
    }),
  );
  root.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...root.querySelectorAll('[data-type]')];
    const index = tabs.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
  list.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [...list.querySelectorAll('[role="option"]')];
    const index = options.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    if (options[next]) {
      event.preventDefault();
      options[next].focus();
    }
  });
  search.addEventListener('input', () => {
    clearTimeout(search.timer);
    search.timer = setTimeout(() => load(), 250);
  });
  sort.addEventListener('change', () => load());
  root.querySelectorAll('[data-view]').forEach((button) =>
    button.addEventListener('click', () => {
      list.dataset.view = button.dataset.view;
      root
        .querySelectorAll('[data-view]')
        .forEach((view) => view.setAttribute('aria-pressed', String(view === button)));
    }),
  );
  root.querySelector('[data-more]').addEventListener('click', () => {
    page += 1;
    load(true);
  });
  root.querySelector('[data-upload]').addEventListener('click', () => file.click());
  const upload = async (files) => {
    for (const item of files) {
      say(message('uploading', item.name));
      try {
        const response = await request(api, {
          method: 'POST',
          body: item,
          headers: {
            'Content-Type': item.type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${asciiFilename(item.name)}"`,
          },
        });
        const media = await response.json();
        if (!validMedia(media)) throw new Error('The uploaded media response was invalid.');
        say(message('uploaded', item.name));
      } catch (error) {
        say(message('uploadError', item.name, error.message));
      }
    }
    await load();
  };
  file.addEventListener('change', () => upload(file.files));
  root.addEventListener('dragover', (event) => {
    event.preventDefault();
    root.classList.add('is-dragging');
  });
  root.addEventListener('dragleave', () => root.classList.remove('is-dragging'));
  root.addEventListener('drop', (event) => {
    event.preventDefault();
    root.classList.remove('is-dragging');
    upload(event.dataTransfer.files);
  });
  load();
}
document.querySelector('[data-copy]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const text = document.querySelector('[data-diagnostics]').value;
  const status = document.querySelector('[data-copy-status]');
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = button.dataset.copySuccess;
  } catch {
    const area = document.querySelector('[data-diagnostics]');
    area.hidden = false;
    area.select();
    document.execCommand('copy');
    area.hidden = true;
    status.textContent = button.dataset.copySuccess;
  }
  button.focus();
});
