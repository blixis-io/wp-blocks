import { describe, expect, it } from 'vitest';
import { FIXED_NOW, fixedClock, seededRandom, sequentialIds } from './deterministic.ts';

describe('deterministic helpers', () => {
  it('the fixed clock starts at 2026-01-01T00:00:00Z and only moves when ticked', () => {
    const clock = fixedClock();
    expect(new Date(clock.now()).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.now()).toBe(FIXED_NOW);
    clock.tick(1500);
    expect(clock.now()).toBe(FIXED_NOW + 1500);
  });

  it('sequential ids are predictable and independent per generator', () => {
    const a = sequentialIds();
    const b = sequentialIds('blk');
    expect([a(), a(), a()]).toEqual(['el-001', 'el-002', 'el-003']);
    expect(b()).toBe('blk-001');
  });

  it('seeded random numbers repeat for the same seed and differ for another', () => {
    const take = (seed: number): number[] => {
      const next = seededRandom(seed);
      return Array.from({ length: 5 }, () => next());
    };
    expect(take(42)).toEqual(take(42));
    expect(take(42)).not.toEqual(take(43));
    expect(take(42).every((n) => n >= 0 && n < 1)).toBe(true);
    expect(take(1)).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849,
    ]);
  });
});
