/** localStorage helpers that never throw (private windows, blocked site data and quota errors are all ignored). */
export function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    /* the preference simply is not remembered */
  }
}

/** Session preferences are isolated from persisted editor and website settings. */
export function readSessionStorage(key: string): string | null {
  try {
    return globalThis.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionStorage(key: string, value: string): void {
  try {
    globalThis.sessionStorage.setItem(key, value);
  } catch {
    /* the preference simply is not remembered */
  }
}
