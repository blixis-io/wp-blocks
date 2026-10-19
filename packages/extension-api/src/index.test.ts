import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@blixis/wp-capabilities';
import { ElementRegistry } from '@blixis/wp-element-registry';
import { createExtensionRegistrar, EXTENSION_API_VERSION } from './index';

describe('public extension registrar', () => {
  it('exposes only host-bound element and capability registration', () => {
    const api = createExtensionRegistrar('plus', new ElementRegistry(), new CapabilityRegistry());
    expect(api.apiVersion).toBe(EXTENSION_API_VERSION);
    expect(Object.keys(api).sort()).toEqual(['apiVersion', 'registerCapability', 'registerElement']);
    expect(
      api.registerCapability({
        id: 'blixis-plus/templates',
        version: 1,
        requiresApi: 1,
        tier: 'plus',
        fallback: 'retained',
      }),
    ).toEqual({ ok: true });
    expect(
      api.registerCapability({
        id: 'blixis-pro/commerce',
        version: 1,
        requiresApi: 1,
        tier: 'pro',
        fallback: 'static',
      }).ok,
    ).toBe(false);
  });
});
