/* global document, window */

(() => {
  const initAccordion = (root) => {
    if (root.dataset.blxAccordionReady === 'true') return;
    const items = Array.from(root.querySelectorAll('details'));
    if (items.length === 0) return;
    root.dataset.blxAccordionReady = 'true';
    const multiple = root.getAttribute('data-blx-accordion-multiple') === 'true';
    const collapsible = root.getAttribute('data-blx-accordion-collapsible') !== 'false';
    let changing = false;
    items.forEach((item) => {
      item.addEventListener('toggle', () => {
        if (changing) return;
        if (!collapsible && !item.open) {
          changing = true;
          item.open = true;
          changing = false;
          return;
        }
        if (item.open && !multiple) {
          changing = true;
          items.forEach((other) => {
            if (other !== item) other.open = false;
          });
          changing = false;
        }
      });
    });
  };

  const initTabs = (root) => {
    if (root.dataset.blxTabsReady === 'true') return;
    const nav = root.querySelector('nav');
    const links = Array.from(root.querySelectorAll('nav a[href^="#"]'));
    const sections = Array.from(root.querySelectorAll('section[id]'));
    const panels = links.map((link) => {
      const id = link.getAttribute('href')?.slice(1);
      return id ? sections.find((section) => section.id === id) || null : null;
    });
    if (!nav || links.length === 0 || panels.some((panel) => !panel || !root.contains(panel))) return;

    root.dataset.blxTabsReady = 'true';
    nav.setAttribute('role', 'tablist');
    nav.querySelector('ul')?.setAttribute('role', 'presentation');
    const orientation = root.getAttribute('data-blx-tabs-orientation') === 'vertical' ? 'vertical' : 'horizontal';
    nav.setAttribute('aria-orientation', orientation);
    links.forEach((link) => link.parentElement?.setAttribute('role', 'presentation'));
    const defaultKey = root.getAttribute('data-blx-tabs-default');
    let activeIndex = links.findIndex((link) => link.getAttribute('data-blx-tab-key') === defaultKey);
    if (activeIndex < 0) activeIndex = 0;

    const activate = (index, focus = false) => {
      activeIndex = (index + links.length) % links.length;
      links.forEach((link, current) => {
        const selected = current === activeIndex;
        link.setAttribute('role', 'tab');
        const panel = panels[current];
        if (panel) link.setAttribute('aria-controls', panel.id);
        link.setAttribute('aria-selected', String(selected));
        link.tabIndex = selected ? 0 : -1;
        if (!panel) return;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', link.id);
        panel.tabIndex = 0;
        panel.hidden = !selected;
      });
      if (focus) links[activeIndex]?.focus();
    };

    links.forEach((link, index) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        activate(index);
      });
      link.addEventListener('keydown', (event) => {
        const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
        const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        if (event.key === previous) {
          event.preventDefault();
          activate(activeIndex - 1, true);
        } else if (event.key === next) {
          event.preventDefault();
          activate(activeIndex + 1, true);
        } else if (event.key === 'Home') {
          event.preventDefault();
          activate(0, true);
        } else if (event.key === 'End') {
          event.preventDefault();
          activate(links.length - 1, true);
        }
      });
    });
    activate(activeIndex);
  };

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

  const initLightbox = (root) => {
    const triggers = Array.from(root.querySelectorAll('a[data-blx-lightbox-trigger]'));
    if (root.dataset.blxLightboxReady === 'true' || triggers.length === 0) return;
    root.dataset.blxLightboxReady = 'true';
    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        const url = trigger.getAttribute('href');
        if (!url) return;
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') return;
        event.preventDefault();
        dialog.setAttribute('aria-label', root.getAttribute('data-blx-lightbox-label') || 'Image preview');
        dialog.className = 'blx-lightbox-dialog';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'blx-lightbox-close';
        close.setAttribute('aria-label', root.getAttribute('data-blx-lightbox-close') || 'Close image preview');
        close.textContent = '×';
        close.addEventListener('click', () => dialog.close());
        const image = document.createElement('img');
        image.src = url;
        image.alt = trigger.querySelector('img')?.alt || '';
        dialog.append(close, image);
        dialog.addEventListener('click', (closeEvent) => {
          if (closeEvent.target === dialog) dialog.close();
        });
        dialog.addEventListener(
          'close',
          () => {
            dialog.remove();
            trigger.focus();
          },
          { once: true },
        );
        root.append(dialog);
        dialog.showModal();
        close.focus();
      });
    });
  };

  const initImageComparison = (root) => {
    if (root.dataset.blxComparisonReady === 'true') return;
    const input = root.querySelector('[data-blx-comparison-control]');
    const before = root.querySelector('[data-blx-comparison-before]');
    const after = root.querySelector('[data-blx-comparison-after]');
    if (!input || !before || !after) return;
    const update = () => {
      const position = Math.max(0, Math.min(100, Number(input.value) || 0));
      root.style.setProperty('--blx-comparison-position', `${position}%`);
    };
    input.addEventListener('input', update);
    input.removeAttribute('hidden');
    root.dataset.blxComparisonReady = 'true';
    update();
  };

  const initMap = (root) => {
    const button = root.querySelector('[data-blx-map-load]');
    if (!button || button.dataset.blxMapReady === 'true') return;
    button.dataset.blxMapReady = 'true';
    button.addEventListener('click', () => {
      const raw = button.getAttribute('data-blx-map-src') || '';
      let url;
      try {
        url = new window.URL(raw, window.location.href);
      } catch {
        return;
      }
      if (
        url.protocol !== 'https:' ||
        !['www.openstreetmap.org', 'maps.google.com'].includes(url.hostname) ||
        (!url.pathname.includes('embed') && !url.hostname.startsWith('maps.google.com'))
      )
        return;
      const frame = document.createElement('iframe');
      frame.className = 'blx-map-frame';
      frame.src = url.href;
      frame.title = button.getAttribute('data-blx-map-title') || 'Map';
      frame.loading = 'eager';
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.setAttribute('allowfullscreen', '');
      frame.tabIndex = 0;
      button.setAttribute('aria-expanded', 'true');
      button.disabled = true;
      root.insertBefore(frame, button.nextSibling);
    });
  };

  const initPanorama = (root) => {
    const viewer = root.querySelector('[data-blx-panorama-viewer]');
    if (!viewer || viewer.dataset.blxPanoramaReady === 'true') return;
    viewer.dataset.blxPanoramaReady = 'true';
    viewer.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      viewer.scrollLeft = Math.max(
        0,
        viewer.scrollLeft + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 160 : 48),
      );
    });
    let drag = null;
    viewer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, scrollLeft: viewer.scrollLeft, pointerId: event.pointerId };
    });
    viewer.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      viewer.scrollLeft = drag.scrollLeft + drag.x - event.clientX;
    });
    const finish = (event) => {
      if (drag && event.pointerId === drag.pointerId) drag = null;
    };
    viewer.addEventListener('pointerup', finish);
    viewer.addEventListener('pointercancel', finish);
  };

  const initScrollSpy = (root) => {
    if (root.dataset.blxScrollSpyReady === 'true' || typeof window.IntersectionObserver !== 'function') return;
    const links = Array.from(root.querySelectorAll('a[href]'));
    const targets = links
      .map((link) => {
        let url;
        try {
          url = new window.URL(link.getAttribute('href') || '', window.location.href);
        } catch {
          return null;
        }
        if (url.origin !== window.location.origin || !url.hash) return null;
        let id;
        try {
          id = decodeURIComponent(url.hash.slice(1));
        } catch {
          return null;
        }
        const target = document.getElementById(id);
        return target ? { link, target } : null;
      })
      .filter((entry) => entry !== null);
    if (targets.length === 0) return;

    root.dataset.blxScrollSpyReady = 'true';
    const visible = new Map();
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visible.set(entry.target, entry.isIntersecting));
        const current = targets
          .filter(({ target }) => visible.get(target))
          .map((entry) => ({ ...entry, top: entry.target.getBoundingClientRect().top }))
          .sort((left, right) => Math.abs(left.top) - Math.abs(right.top))[0];
        targets.forEach(({ link }) => link.removeAttribute('aria-current'));
        current?.link.setAttribute('aria-current', 'location');
      },
      { rootMargin: '0px 0px -65% 0px', threshold: 0 },
    );
    targets.forEach(({ target }) => observer.observe(target));
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
    document.querySelectorAll('[data-blx-lightbox-gallery]').forEach(initLightbox);
    document.querySelectorAll('[data-blx-image-comparison]').forEach(initImageComparison);
    document.querySelectorAll('[data-blx-map]').forEach(initMap);
    document.querySelectorAll('[data-blx-panorama]').forEach(initPanorama);
    document.querySelectorAll('[data-blx-accordion]').forEach(initAccordion);
    document.querySelectorAll('[data-blx-tabs]').forEach(initTabs);
    document.querySelectorAll('[data-blx-scroll-spy]').forEach(initScrollSpy);
  };
  window.blxInitMarquee = initMarquee;
  window.blxInitResizablePanels = initResizablePanels;
  window.blxInitCodeBlock = initCodeBlock;
  window.blxInitCountdown = initCountdown;
  window.blxInitActionButton = initActionButton;
  window.blxInitLightbox = initLightbox;
  window.blxInitImageComparison = initImageComparison;
  window.blxInitMap = initMap;
  window.blxInitPanorama = initPanorama;
  window.blxInitAccordion = initAccordion;
  window.blxInitTabs = initTabs;
  window.blxInitScrollSpy = initScrollSpy;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
