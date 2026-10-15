import { createRoot, type Root } from 'react-dom/client';
import { EditorApp } from './App';
import { readBootstrap, type EditorBootstrap } from './bootstrap';
import { ErrorScreen } from './ErrorScreen';

declare global {
  // Read by the style-singleton helper behind Radix dialogs to put the CSP nonce on the <style> elements it creates.
  var __webpack_nonce__: string | undefined;
}

export const ROOT_ELEMENT_ID = 'blixis-editor-root';

/**
 * Mounts the editor into `container`. Without an explicit bootstrap it reads and validates the JSON printed by the
 * PHP admin screen; an invalid bootstrap renders a generic error screen and never throws.
 */
export function mountEditor(container: HTMLElement, bootstrap?: EditorBootstrap): Root {
  const root = createRoot(container);
  const resolved = bootstrap ? { ok: true as const, value: bootstrap } : readBootstrap(container.ownerDocument);
  if (resolved.ok) globalThis.__webpack_nonce__ = resolved.value.cspNonce;
  root.render(resolved.ok ? <EditorApp bootstrap={resolved.value} /> : <ErrorScreen />);
  return root;
}

const autoContainer = document.getElementById(ROOT_ELEMENT_ID);
if (autoContainer) mountEditor(autoContainer);
