import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from './storage';

export const PANELS_STORAGE_KEY = 'blixis-editor-panels';
export interface PanelState {
  left: boolean;
  right: boolean;
}

/** Reads which side panels are open (default: both). Anything unexpected falls back to open. */
export function readPanelState(): PanelState {
  const fallback: PanelState = { left: true, right: true };
  const stored = readStorage(PANELS_STORAGE_KEY);
  if (stored === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const record = parsed as Record<string, unknown>;
    return {
      left: typeof record['left'] === 'boolean' ? record['left'] : true,
      right: typeof record['right'] === 'boolean' ? record['right'] : true,
    };
  } catch {
    return fallback;
  }
}

export function usePanelState() {
  const [state, setState] = useState<PanelState>(readPanelState);
  const toggle = useCallback((side: keyof PanelState) => {
    setState((current) => {
      const next = { ...current, [side]: !current[side] };
      writeStorage(PANELS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return { state, toggle };
}
