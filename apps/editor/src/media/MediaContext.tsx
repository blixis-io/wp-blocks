import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { EditorBootstrap } from '../bootstrap';
import { createMediaClient } from '../api/media-client';
import type { MediaClient } from '../api/types';

export interface MediaServices {
  client: MediaClient;
  canUpload: boolean;
}
const MediaContext = createContext<MediaServices | null>(null);
const unavailable: MediaServices = {
  canUpload: false,
  client: {
    get: () => Promise.resolve({ ok: false, error: { kind: 'network' } }),
    list: () => Promise.resolve({ ok: false, error: { kind: 'network' } }),
    upload: () => Promise.resolve({ ok: false, error: { kind: 'network' } }),
  },
};
export function MediaProvider({
  bootstrap,
  children,
  client: clientOverride,
}: {
  bootstrap: EditorBootstrap;
  children: ReactNode;
  client?: MediaClient | undefined;
}) {
  const client = useMemo(
    () =>
      clientOverride ??
      createMediaClient({
        wpRestRoot: bootstrap.wpRestRoot,
        nonce: bootstrap.nonce,
        maxUploadBytes: bootstrap.maxUploadBytes,
      }),
    [bootstrap, clientOverride],
  );
  return <MediaContext.Provider value={{ client, canUpload: bootstrap.canUpload }}>{children}</MediaContext.Provider>;
}
export function useMediaServices(): MediaServices {
  const services = useContext(MediaContext);
  return services ?? unavailable;
}
