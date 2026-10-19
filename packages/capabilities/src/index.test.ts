import { describe, expect, it } from 'vitest';
import { CapabilityRegistry, CAPABILITY_API_VERSION, hasServerCapability } from './index';

const definition = { id: 'blixis-plus/templates', version: 1, requiresApi: 1, tier: 'plus', fallback: 'retained' };

describe('CapabilityRegistry', () => {
  it('accepts an authorized Plus capability and emits a sorted, versioned manifest', () => {
    const registry = new CapabilityRegistry();
    expect(registry.register(definition, 'plus')).toEqual({ ok: true });
    expect(registry.manifest()).toEqual({ apiVersion: CAPABILITY_API_VERSION, capabilities: [definition] });
  });

  it('rejects tier, namespace, fallback and future API mismatches', () => {
    const registry = new CapabilityRegistry();
    expect(registry.register({ ...definition, id: 'blixis-pro/templates' }, 'plus').ok).toBe(false);
    expect(registry.register({ ...definition, tier: 'free', fallback: undefined }, 'plus').ok).toBe(false);
    expect(registry.register({ ...definition, requiresApi: CAPABILITY_API_VERSION + 1 }, 'plus').ok).toBe(false);
    expect(registry.register({ ...definition, fallback: 'dynamic' }, 'plus').ok).toBe(false);
  });

  it('does not throw on malformed or hostile definitions and rejects duplicate ids', () => {
    const registry = new CapabilityRegistry();
    const hostile = Object.defineProperty({}, 'id', {
      enumerable: true,
      get: () => {
        throw new Error('getter');
      },
    });
    expect(() => registry.register(hostile, 'plus')).not.toThrow();
    expect(registry.register(hostile, 'plus').ok).toBe(false);
    expect(registry.register(definition, 'plus').ok).toBe(true);
    expect(registry.register(definition, 'plus').ok).toBe(false);
  });

  it('binds extension registration to a host-assigned source', () => {
    const registrar = new CapabilityRegistry().registrarFor('vendor');
    expect(registrar.register({ ...definition, id: 'acme/feature', tier: 'free', fallback: undefined }).ok).toBe(true);
    expect(registrar.register(definition).ok).toBe(false);
  });
});

describe('hasServerCapability', () => {
  it('accepts only a matching server snapshot and a strict true entitlement', () => {
    expect(
      hasServerCapability(
        { apiVersion: CAPABILITY_API_VERSION, entitlements: { 'blixis-plus/templates': true } },
        'blixis-plus/templates',
      ),
    ).toBe(true);
    expect(
      hasServerCapability(
        { apiVersion: CAPABILITY_API_VERSION + 1, entitlements: { 'blixis-plus/templates': true } },
        'blixis-plus/templates',
      ),
    ).toBe(false);
    expect(
      hasServerCapability(
        { apiVersion: CAPABILITY_API_VERSION, entitlements: { 'blixis-plus/templates': 1 as unknown as boolean } },
        'blixis-plus/templates',
      ),
    ).toBe(false);
  });
});
