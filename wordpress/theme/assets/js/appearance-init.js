/* global document */
(function () {
  try {
    const value = localStorage.getItem('blixis-appearance');
    if (value === 'light' || value === 'dark') {
      document.documentElement.setAttribute('data-theme', value);
      document.querySelector('meta[name="color-scheme"]').setAttribute('content', value);
    }
  } catch {
    // Storage can be disabled.
  }
})();
