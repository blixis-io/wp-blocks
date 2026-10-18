/* global document, window */

(() => {
  const initCodeBlock = (root) => {
    const button = root.querySelector('[data-blx-code-copy]');
    const code = root.querySelector('code');
    const status = root.querySelector('[data-blx-code-status]');
    if (!button || !code || root.dataset.blxCodeReady === 'true') return;
    root.dataset.blxCodeReady = 'true';
    button.hidden = false;
    button.addEventListener('click', async () => {
      let copied = false;
      try {
        if (window.navigator.clipboard?.writeText) {
          await window.navigator.clipboard.writeText(code.textContent || '');
          copied = true;
        } else {
          const field = document.createElement('textarea');
          field.value = code.textContent || '';
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.append(field);
          field.select();
          copied = document.execCommand('copy');
          field.remove();
        }
      } catch {
        copied = false;
      }
      if (status)
        status.textContent = copied
          ? button.getAttribute('data-blx-copy-success') || 'Copied.'
          : button.getAttribute('data-blx-copy-failed') || 'Copy failed.';
    });
  };

  const initCountdown = (root) => {
    if (root.dataset.blxCountdownReady === 'true') return;
    const target = Date.parse(root.getAttribute('data-blx-countdown-target') || '');
    if (!Number.isFinite(target)) return;
    root.dataset.blxCountdownReady = 'true';
    const format = root.getAttribute('data-blx-countdown-format');
    let timer = 0;
    const update = () => {
      const seconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const values = [
        Math.floor(seconds / 86400),
        Math.floor((seconds % 86400) / 3600),
        Math.floor((seconds % 3600) / 60),
        seconds % 60,
      ];
      const visible = format === 'days' ? values.slice(0, 1) : format === 'days-hours' ? values.slice(0, 2) : values;
      root.textContent = visible.map((value) => String(value).padStart(2, '0')).join(':');
      if (seconds === 0) {
        root.textContent = root.getAttribute('data-blx-countdown-complete') || 'Countdown complete';
        window.clearInterval(timer);
      }
    };
    timer = window.setInterval(update, 1000);
    update();
  };

  const initActionButton = (button) => {
    if (button.dataset.blxActionReady === 'true') return;
    button.dataset.blxActionReady = 'true';
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-blx-action-target');
      const target = targetId ? document.getElementById(targetId) : null;
      const action = button.getAttribute('data-blx-action');
      if (action === 'toggle' && target) {
        target.hidden = !target.hidden;
        button.setAttribute('aria-expanded', String(!target.hidden));
      } else if (action === 'open-dialog' && target?.tagName === 'DIALOG') {
        if (typeof target.showModal === 'function') target.showModal();
        else target.setAttribute('open', '');
      } else if (action === 'custom-event') {
        const owner = button.closest('[data-blx-id]');
        owner?.dispatchEvent(
          new window.CustomEvent('blixis:element-action', {
            bubbles: true,
            detail: { elementId: owner.getAttribute('data-blx-id') },
          }),
        );
      }
    });
  };

  const initMarquee = (root) => {
    if (root.dataset.blxMarqueeReady === 'true') return;
    const toggle = root.querySelector('[data-blx-marquee-toggle]');
    const track = root.querySelector('[data-blx-marquee-track]');
    if (!toggle || !track) return;
    const duration = Math.max(10, Math.min(120, Number(root.getAttribute('data-blx-marquee-duration')) || 30));
    root.style.setProperty('--blx-marquee-duration', `${duration}s`);
    root.dataset.blxMarqueeReady = 'true';
    toggle.addEventListener('click', () => {
      const paused = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(paused));
      if (paused) {
        root.setAttribute('data-blx-marquee-paused', '');
        toggle.setAttribute('aria-label', toggle.getAttribute('data-blx-resume-label') || 'Resume scrolling');
        toggle.textContent = toggle.getAttribute('data-blx-resume-label') || 'Resume scrolling';
      } else {
        root.removeAttribute('data-blx-marquee-paused');
        const pauseLabel = toggle.getAttribute('data-blx-pause-label') || 'Pause scrolling';
        toggle.setAttribute('aria-label', pauseLabel);
        toggle.textContent = pauseLabel;
      }
    });
  };

  const initResizablePanels = (root) => {
    if (root.dataset.blxResizableReady === 'true') return;
    const panels = Array.from(root.children).filter((child) => child.hasAttribute('data-blx-resizable-panel'));
    const handles = Array.from(root.children).filter((child) => child.hasAttribute('data-blx-resize-handle'));
    if (panels.length < 2 || handles.length !== panels.length - 1) return;

    const orientation = root.getAttribute('data-blx-resizable-panels') === 'vertical' ? 'vertical' : 'horizontal';
    const rtl = orientation === 'horizontal' && window.getComputedStyle(root).direction === 'rtl';
    const minimum = Math.max(10, Math.min(40, Number(root.getAttribute('data-blx-resize-min')) || 20));
    root.dataset.blxResizableReady = 'true';

    const resizePair = (index, firstPercent) => {
      const bounded = Math.max(minimum, Math.min(100 - minimum, firstPercent));
      panels[index].style.flexGrow = String((2 * bounded) / 100);
      panels[index + 1].style.flexGrow = String(2 - (2 * bounded) / 100);
      handles[index].setAttribute('aria-valuenow', String(Math.round(bounded)));
    };

    handles.forEach((handle, index) => {
      handle.addEventListener('keydown', (event) => {
        const positive = orientation === 'horizontal' ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
        const negative = orientation === 'horizontal' ? (rtl ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
        if (event.key !== positive && event.key !== negative) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        const current = Number(handle.getAttribute('aria-valuenow')) || 50;
        resizePair(index, current + (event.key === positive ? step : -step));
      });

      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const first = panels[index].getBoundingClientRect();
        const second = panels[index + 1].getBoundingClientRect();
        const start = orientation === 'horizontal' ? event.clientX : event.clientY;
        const firstSize = orientation === 'horizontal' ? first.width : first.height;
        const pairSize = firstSize + (orientation === 'horizontal' ? second.width : second.height);
        if (pairSize <= 0) return;
        const startPercent = (firstSize / pairSize) * 100;
        const forward = (nextEvent) => {
          const coordinate = orientation === 'horizontal' ? nextEvent.clientX : nextEvent.clientY;
          const direction = rtl ? -1 : 1;
          const delta = ((coordinate - start) * direction * 100) / pairSize;
          resizePair(index, startPercent + delta);
        };
        const pointerId = event.pointerId;
        const matchesPointer = (nextEvent) => nextEvent.pointerId === pointerId;
        const move = (nextEvent) => {
          if (matchesPointer(nextEvent)) forward(nextEvent);
        };
        const finish = (nextEvent) => {
          if (!matchesPointer(nextEvent)) return;
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', finish);
          document.removeEventListener('pointercancel', finish);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', finish);
        document.addEventListener('pointercancel', finish);
      });
    });
  };

  const init = () => {
    document.querySelectorAll('[data-blx-marquee]').forEach(initMarquee);
    document.querySelectorAll('[data-blx-resizable-panels]').forEach(initResizablePanels);
    document.querySelectorAll('[data-blx-code-block]').forEach(initCodeBlock);
    document.querySelectorAll('[data-blx-countdown]').forEach(initCountdown);
    document.querySelectorAll('[data-blx-action]').forEach(initActionButton);
  };
  window.blxInitMarquee = initMarquee;
  window.blxInitResizablePanels = initResizablePanels;
  window.blxInitCodeBlock = initCodeBlock;
  window.blxInitCountdown = initCountdown;
  window.blxInitActionButton = initActionButton;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
