const active = new WeakMap<Element, Animation>();
let query: MediaQueryList | undefined;
let reduced = false;
function prefersReducedMotion(): boolean {
  if (!query && typeof window !== 'undefined') {
    if (typeof window.matchMedia !== 'function') return false;
    query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = query.matches;
    query.addEventListener('change', (event) => {
      reduced = event.matches;
      if (reduced) {
        document.querySelectorAll('[data-motion-waapi]').forEach((element) => {
          cancelMotion(element);
        });
      }
    });
  }
  return reduced;
}
export function animate(
  element: Element,
  frames: Keyframe[],
  options?: number | KeyframeAnimationOptions,
): Animation | undefined {
  if (prefersReducedMotion() || typeof element.animate !== 'function') return undefined;
  cancelMotion(element);
  const animation = element.animate(frames, options);
  active.set(element, animation);
  element.setAttribute('data-motion-waapi', '');
  const clear = () => {
    if (active.get(element) === animation) {
      active.delete(element);
      element.removeAttribute('data-motion-waapi');
    }
  };
  void animation.finished.then(clear, clear);
  return animation;
}
export function cancelMotion(element: Element): void {
  active.get(element)?.cancel();
  active.delete(element);
  element.removeAttribute('data-motion-waapi');
}
