/** Fixed point in time used by every test that needs "now": 2026-01-01T00:00:00Z. */
export const FIXED_NOW = Date.UTC(2026, 0, 1, 0, 0, 0);

/** A clock that only moves when told to. */
export function fixedClock(start: number = FIXED_NOW): { now: () => number; tick: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    tick: (ms: number) => {
      current += ms;
    },
  };
}

/** Predictable element ids: `el-001`, `el-002`, ... Never use random ids in fixtures or snapshots. */
export function sequentialIds(prefix = 'el'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n).padStart(3, '0')}`;
  };
}

/** Seeded pseudo-random numbers in [0, 1) (mulberry32), for property-style tests that must be reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
