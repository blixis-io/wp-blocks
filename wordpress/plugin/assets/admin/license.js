/* global document, window */
(() => {
  const root = document.querySelector('[data-license-mock]');
  if (!root) return;

  const feedback = root.querySelector('[data-license-feedback]');
  const panel = root.querySelector('[data-license-replace-panel]');
  const input = root.querySelector('[data-license-input]');
  const key = root.querySelector('[data-license-key]');
  const messages = window.blixisLicenseDemo || {};
  const say = (message) => {
    if (feedback) feedback.textContent = message;
  };

  root.querySelector('[data-license-renew]')?.addEventListener('click', () => {
    say(messages.renewal || 'Renewal preview only. No request was made.');
  });

  root.querySelector('[data-license-replace]')?.addEventListener('click', () => {
    if (!panel || !input) return;
    panel.hidden = false;
    say(messages.prompt || 'Enter a demo key to preview replacement.');
    input.focus();
  });

  root.querySelector('[data-license-cancel]')?.addEventListener('click', () => {
    if (panel) panel.hidden = true;
    if (input) input.value = '';
    root.querySelector('[data-license-replace]')?.focus();
    say(messages.cancelled || 'Replacement preview cancelled.');
  });

  root.querySelector('[data-license-apply]')?.addEventListener('click', () => {
    if (!input || !key) return;
    const value = input.value.trim();
    if (value.length < 8) {
      say(messages.invalid || 'Enter at least 8 characters.');
      input.focus();
      return;
    }
    const last = value
      .slice(-4)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '•');
    key.textContent = `BLIXIS-DEMO-••••-${last}`;
    input.value = '';
    if (panel) panel.hidden = true;
    say(messages.replaced || 'Replacement preview shown. No license was sent.');
    root.querySelector('[data-license-replace]')?.focus();
  });
})();
