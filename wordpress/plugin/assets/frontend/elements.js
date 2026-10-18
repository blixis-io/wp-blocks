/* global document, window */

(() => {
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
  };
  window.blxInitMarquee = initMarquee;
  window.blxInitResizablePanels = initResizablePanels;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
