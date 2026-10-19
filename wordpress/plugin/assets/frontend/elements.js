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

  const initOffcanvas = (root) => {
    if (root.dataset.blxOffcanvasReady === 'true') return;
    const summary = root.querySelector('summary');
    const panel = root.querySelector('[data-blx-offcanvas-panel]');
    const close = root.querySelector('[data-blx-offcanvas-close]');
    if (!summary || !panel || !close) return;
    root.dataset.blxOffcanvasReady = 'true';
    const modal = root.getAttribute('data-blx-offcanvas-modal') === 'true';
    const closeOnEscape = root.getAttribute('data-blx-offcanvas-close-escape') !== 'false';
    const closeOnOutside = root.getAttribute('data-blx-offcanvas-close-outside') !== 'false';
    const openOn = root.getAttribute('data-blx-offcanvas-open-on') || 'click';
    const inerted = new Map();
    let shouldReturnFocus = false;

    const setOutsideInert = (inert) => {
      if (!modal) return;
      if (!inert) {
        inerted.forEach((wasInert, element) => {
          element.inert = wasInert;
        });
        inerted.clear();
        return;
      }
      let branch = root;
      while (branch.parentElement) {
        const parent = branch.parentElement;
        Array.from(parent.children).forEach((sibling) => {
          if (sibling === branch || !(sibling instanceof window.HTMLElement) || inerted.has(sibling)) return;
          inerted.set(sibling, sibling.inert === true);
          sibling.inert = true;
        });
        if (parent === document.body) break;
        branch = parent;
      }
    };

    const focusable = () =>
      Array.from(
        panel.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

    const closePanel = (returnFocus = true) => {
      shouldReturnFocus = returnFocus;
      root.open = false;
      setOutsideInert(false);
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      summary.setAttribute('aria-expanded', 'false');
      if (returnFocus) summary.focus();
    };

    const update = () => {
      summary.setAttribute('aria-expanded', String(root.open));
      if (!root.open) {
        setOutsideInert(false);
        panel.removeAttribute('role');
        panel.removeAttribute('aria-modal');
        if (shouldReturnFocus) summary.focus();
        shouldReturnFocus = false;
        return;
      }
      if (modal) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', root.getAttribute('data-blx-offcanvas-label') || 'Panel');
        setOutsideInert(true);
        (focusable()[0] || panel).focus();
      }
    };

    root.addEventListener('toggle', update);
    close.addEventListener('click', () => closePanel());
    if (openOn === 'hover') {
      root.addEventListener('pointerenter', () => {
        root.open = true;
      });
      root.addEventListener('pointerleave', () => {
        if (!root.contains(document.activeElement)) closePanel(false);
      });
      summary.addEventListener('click', (event) => {
        event.preventDefault();
        root.open = true;
      });
    } else if (openOn === 'focus') {
      root.addEventListener('focusin', () => {
        root.open = true;
      });
      root.addEventListener('focusout', (event) => {
        if (!root.contains(event.relatedTarget)) closePanel(false);
      });
      summary.addEventListener('click', (event) => {
        event.preventDefault();
        root.open = true;
      });
    } else if (openOn === 'manual') {
      summary.addEventListener('click', (event) => {
        event.preventDefault();
      });
      root.addEventListener('blixis:offcanvas-open', () => {
        root.open = true;
      });
      root.addEventListener('blixis:offcanvas-close', () => closePanel(false));
    }
    root.addEventListener('keydown', (event) => {
      if (closeOnEscape && event.key === 'Escape' && root.open) {
        event.preventDefault();
        closePanel();
      }
      if (modal && event.key === 'Tab' && root.open) {
        const controls = focusable();
        if (controls.length === 0) {
          event.preventDefault();
          panel.focus();
          return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
    if (closeOnOutside) {
      document.addEventListener('pointerdown', (event) => {
        if (root.open && !root.contains(event.target)) closePanel();
      });
      root.addEventListener('click', (event) => {
        if (root.open && modal && event.target === root) closePanel();
      });
    }
    if (root.open) update();
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
    document.querySelectorAll('[data-blx-loading-button]').forEach((button) => {
      const form = button.closest('form');
      if (!form || form.dataset.blxLoadingHandler) return;
      form.dataset.blxLoadingHandler = 'true';
      form.addEventListener('submit', (event) => {
        const submitter = event.submitter;
        if (!submitter || !submitter.matches('[data-blx-loading-button]')) return;
        submitter.setAttribute('aria-busy', 'true');
        submitter.disabled = true;
        submitter.textContent = submitter.dataset.blxLoadingLabel || 'Loading…';
      });
    });
    document.querySelectorAll('[data-blx-context-menu]').forEach((menu) => {
      const summary = menu.querySelector('summary');
      menu.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        menu.open = true;
        menu.dataset.blxContextPositioned = 'true';
        menu.style.setProperty('--blx-context-x', `${event.clientX}px`);
        menu.style.setProperty('--blx-context-y', `${event.clientY}px`);
        summary?.focus();
      });
      menu.addEventListener('toggle', () => {
        if (!menu.open || menu.dataset.blxContextPositioned === 'true' || !summary) return;
        const rect = summary.getBoundingClientRect();
        menu.style.setProperty('--blx-context-x', `${rect.left}px`);
        menu.style.setProperty('--blx-context-y', `${rect.bottom}px`);
      });
      document.addEventListener('pointerdown', (event) => {
        if (!menu.contains(event.target)) menu.open = false;
      });
      menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          menu.open = false;
          summary?.focus();
        }
      });
    });
    document.querySelectorAll('[data-blx-range-slider]').forEach((group) => {
      if (group.dataset.blxInitialized) return;
      group.dataset.blxInitialized = 'true';
      const lower = group.querySelector('input[name$="[min]"]');
      const upper = group.querySelector('input[name$="[max]"]');
      if (!lower || !upper) return;
      const lowerOutput = group.querySelector('[data-blx-range-lower-value]');
      const upperOutput = group.querySelector('[data-blx-range-upper-value]');
      const update = (changed) => {
        if (Number(lower.value) > Number(upper.value)) {
          if (changed === lower) upper.value = lower.value;
          else lower.value = upper.value;
        }
        if (lowerOutput) lowerOutput.value = lower.value;
        if (upperOutput) upperOutput.value = upper.value;
      };
      lower.addEventListener('input', () => update(lower));
      upper.addEventListener('input', () => update(upper));
    });
    document.querySelectorAll('[data-blx-copy-button]').forEach((button) => {
      button.addEventListener('click', async () => {
        const value = button.dataset.blxCopyText || '';
        const status = button.parentElement.querySelector('[data-blx-copy-status]');
        try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            const field = document.createElement('textarea');
            field.value = value;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.append(field);
            field.select();
            const copied = document.execCommand('copy');
            field.remove();
            if (!copied) throw new Error('Clipboard unavailable');
          }
          if (status) status.textContent = button.dataset.blxCopySuccess || 'Copied.';
        } catch {
          if (status) status.textContent = button.dataset.blxCopyFailed || 'Copy failed.';
        }
      });
    });
    document.querySelectorAll('[data-blx-command-search]').forEach((input) => {
      input.addEventListener('input', () => {
        const list = input.parentElement.querySelector('ul');
        if (!list) return;
        const query = input.value.trim().toLocaleLowerCase();
        const items = Array.from(list.querySelectorAll(':scope > li:not([data-blx-command-empty])'));
        let visible = 0;
        items.forEach((item) => {
          item.hidden = query !== '' && !item.textContent.toLocaleLowerCase().includes(query);
          if (!item.hidden) visible += 1;
        });
        const empty = list.querySelector('[data-blx-command-empty]');
        if (empty) empty.hidden = visible > 0;
      });
    });
    document.querySelectorAll('[data-blx-carousel]').forEach((carousel) => {
      if (carousel.dataset.blxInitialized) return;
      carousel.dataset.blxInitialized = 'true';
      const track = carousel.querySelector('[data-blx-carousel-track]');
      if (!track) return;
      const loop = carousel.dataset.blxCarouselLoop === 'true';
      const slidesPerView = Math.max(1, Number(carousel.dataset.blxCarouselSlides) || 1);
      const step = () => Math.max(1, track.clientWidth / slidesPerView);
      const move = (direction) => {
        const end = track.scrollWidth - track.clientWidth;
        if (direction > 0 && track.scrollLeft >= end - 2 && loop) track.scrollTo({ left: 0, behavior: 'smooth' });
        else if (direction < 0 && track.scrollLeft <= 2 && loop) track.scrollTo({ left: end, behavior: 'smooth' });
        else track.scrollBy({ left: step() * direction, behavior: 'smooth' });
      };
      carousel.querySelector('[data-blx-carousel-previous]')?.addEventListener('click', () => move(-1));
      carousel.querySelector('[data-blx-carousel-next]')?.addEventListener('click', () => move(1));
      carousel.querySelectorAll('[data-blx-carousel-dot]').forEach((dot) => {
        dot.addEventListener('click', () => {
          const slide = track.querySelectorAll('[data-blx-carousel-slide]')[Number(dot.dataset.blxCarouselDot)];
          slide?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        });
      });
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (carousel.dataset.blxCarouselAutoplay === 'true' && reduceMotion)
        carousel.querySelector('[data-blx-carousel-pause]')?.remove();
      if (carousel.dataset.blxCarouselAutoplay === 'true' && !reduceMotion) {
        const interval = Number(carousel.dataset.blxCarouselInterval) || 5000;
        const pauseButton = carousel.querySelector('[data-blx-carousel-pause]');
        let timer = 0;
        let userPaused = false;
        const pause = () => {
          window.clearInterval(timer);
          timer = 0;
        };
        const resume = () => {
          pause();
          if (!userPaused && !document.hidden) timer = window.setInterval(() => move(1), interval);
        };
        const pauseForInteraction = () => pause();
        const resumeFromInteraction = () => {
          if (!userPaused) resume();
        };
        pauseButton?.addEventListener('click', () => {
          userPaused = !userPaused;
          pauseButton.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
          pauseButton.textContent = userPaused ? pauseButton.dataset.blxPlayLabel : pauseButton.dataset.blxPauseLabel;
          if (userPaused) pause();
          else resume();
        });
        if (carousel.dataset.blxCarouselPauseHover === 'true') {
          carousel.addEventListener('pointerenter', pauseForInteraction);
          carousel.addEventListener('pointerleave', resumeFromInteraction);
        }
        carousel.addEventListener('focusin', pauseForInteraction);
        carousel.addEventListener('focusout', (event) => {
          if (!carousel.contains(event.relatedTarget)) resumeFromInteraction();
        });
        document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
        resume();
      }
    });
    document.querySelectorAll('[data-blx-scroll-indicator]').forEach((progress) => {
      const update = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const range = Number(progress.dataset.blxScrollMax) || 100;
        const value = max > 0 ? (window.scrollY / max) * range : 0;
        progress.value = value;
        const output = progress.parentElement.querySelector('[data-blx-scroll-indicator-value]');
        if (output) output.value = `${Math.round((value / range) * 100)}%`;
      };
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update, { passive: true });
    });
    document.querySelectorAll('[data-blx-data-table]').forEach((table) => {
      if (table.dataset.blxInitialized) return;
      table.dataset.blxInitialized = 'true';
      const body = table.tBodies[0];
      if (!body) return;
      const filter = document.getElementById(`${table.id}-filter`);
      filter?.addEventListener('input', () => {
        const query = filter.value.trim().toLocaleLowerCase();
        Array.from(body.rows).forEach((row) => {
          row.hidden = query !== '' && !row.textContent.toLocaleLowerCase().includes(query);
        });
      });
      table.querySelectorAll('[data-blx-sort]').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Array.from(button.closest('tr').cells).indexOf(button.closest('th'));
          const direction = button.dataset.blxDirection === 'asc' ? 'desc' : 'asc';
          button.dataset.blxDirection = direction;
          table.querySelectorAll('th').forEach((header) => header.removeAttribute('aria-sort'));
          button.closest('th')?.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
          Array.from(body.rows)
            .sort((left, right) => {
              const a = left.cells[index]?.textContent.trim() ?? '';
              const b = right.cells[index]?.textContent.trim() ?? '';
              return (
                a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) * (direction === 'asc' ? 1 : -1)
              );
            })
            .forEach((row) => body.append(row));
        });
      });
    });
    document.querySelectorAll('[data-blx-toast-dismiss]').forEach((button) => {
      button.addEventListener('click', () => {
        button.closest('[data-blx-toast]')?.setAttribute('hidden', '');
      });
    });
    document.querySelectorAll('[data-blx-toggle]').forEach((button) => {
      if (button.dataset.blxInitialized) return;
      button.dataset.blxInitialized = 'true';
      button.addEventListener('click', () => {
        button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      });
    });
    document.querySelectorAll('[data-blx-slider]').forEach((slider) => {
      const input = slider.querySelector('input[type="range"]');
      const output = slider.querySelector('output');
      if (!input || !output || slider.dataset.blxInitialized) return;
      slider.dataset.blxInitialized = 'true';
      input.addEventListener('input', () => {
        output.value = input.value;
      });
      input.addEventListener('change', () => {
        output.value = input.value;
      });
    });
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
    document.querySelectorAll('[data-blx-offcanvas]').forEach(initOffcanvas);
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
  window.blxInitOffcanvas = initOffcanvas;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
