import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';

/**
 * Editor CHROME appearance only. It is stored under its own key, applied as `data-editor-theme` on the editor root
 * and never touches `<html>`, the website appearance or the content locale.
 */
export const CHROME_STORAGE_KEY = 'blixis-editor-chrome';
export type ChromePreference = 'system' | 'light' | 'dark';
export type ResolvedChromeTheme = 'light' | 'dark';

export const CHROME_PREFERENCES: readonly ChromePreference[] = ['system', 'light', 'dark'];

export function isChromePreference(value: unknown): value is ChromePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readChromePreference(): ChromePreference {
  const stored = readStorage(CHROME_STORAGE_KEY);
  return isChromePreference(stored) ? stored : 'system';
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemQuery(): MediaQueryList | null {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(DARK_QUERY) : null;
}

export function resolveChromeTheme(preference: ChromePreference, systemPrefersDark: boolean): ResolvedChromeTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function useChromeTheme() {
  const [preference, setPreferenceState] = useState<ChromePreference>(readChromePreference);
  const [systemDark, setSystemDark] = useState<boolean>(() => systemQuery()?.matches ?? false);

  // The media query is consulted for the `system` preference only; the listener keeps it live.
  useEffect(() => {
    const query = systemQuery();
    if (!query) return undefined;
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  const setPreference = useCallback((next: ChromePreference) => {
    setPreferenceState(next);
    writeStorage(CHROME_STORAGE_KEY, next);
  }, []);

  return { preference, resolved: resolveChromeTheme(preference, systemDark), setPreference };
}
