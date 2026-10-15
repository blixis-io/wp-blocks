/* global document, window */
'use strict';

(function () {
  const control = document.querySelector('.appearance-toggle');
  if (!control || !control.hidden) return;

  const buttons = control.querySelectorAll('button[data-appearance]');
  const status = control.querySelector('[aria-live]');
  const messages = JSON.parse(control.dataset.announcements);
  const meta = document.querySelector('meta[name="color-scheme"]');
  const key = 'blixis-appearance';
  const valid = (value) => value === 'light' || value === 'dark';
  let choice = 'system';

  try {
    const stored = localStorage.getItem(key);
    if (valid(stored)) choice = stored;
  } catch {
    // Storage can be blocked; the control still works for this page.
  }

  function render(announce) {
    if (valid(choice)) document.documentElement.setAttribute('data-theme', choice);
    else document.documentElement.removeAttribute('data-theme');
    if (meta) meta.setAttribute('content', valid(choice) ? choice : 'light dark');
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.appearance === choice));
    }
    if (announce && status) status.textContent = messages[choice];
  }

  control.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-appearance]');
    if (!button || !control.contains(button)) return;
    const next = button.dataset.appearance;
    if (next !== 'system' && !valid(next)) return;
    choice = next;
    try {
      if (choice === 'system') localStorage.removeItem(key);
      else localStorage.setItem(key, choice);
    } catch {
      // Keep the current page selection even without storage.
    }
    render(true);
  });

  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) return;
    if (event.key !== key && event.key !== null) return;
    choice = valid(event.newValue) ? event.newValue : 'system';
    render(true);
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    try {
      const stored = localStorage.getItem(key);
      choice = valid(stored) ? stored : 'system';
      render(false);
    } catch {
      // Keep the current page selection when storage is unavailable.
    }
  });

  render(false);
  control.hidden = false;
})();
