import { createContext, useContext, type ReactNode } from 'react';

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Tells overlays (dialog, tooltip) where to render. The editor passes its `.blx-editor` root so that portaled
 * content keeps the scoped styles, theme attribute, `lang` and `dir`; without a provider they use `document.body`.
 */
export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>;
}

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
