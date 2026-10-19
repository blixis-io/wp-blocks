import { EXTENSION_API_VERSION, type ElementRegistry, type Source } from '@blixis/wp-element-registry';
import { type CapabilityRegistry } from '@blixis/wp-capabilities';

export { EXTENSION_API_VERSION };
export type { CapabilityDefinition, CapabilityRegistration, CapabilitySnapshot } from '@blixis/wp-capabilities';
export type { ElementDefinition, RegisterResult } from '@blixis/wp-element-registry';

export interface ExtensionRegistrar {
  readonly apiVersion: number;
  registerElement: (definition: unknown) => ReturnType<ElementRegistry['register']>;
  registerCapability: (definition: unknown) => ReturnType<CapabilityRegistry['register']>;
}

/** Create the limited public handle after the Builder has assigned the extension's provenance. */
export function createExtensionRegistrar(
  source: Source,
  elementRegistry: ElementRegistry,
  capabilityRegistry: CapabilityRegistry,
): ExtensionRegistrar {
  const elements = elementRegistry.registrarFor(source);
  const capabilities = capabilityRegistry.registrarFor(source);
  return Object.freeze({
    apiVersion: EXTENSION_API_VERSION,
    registerElement: elements.register,
    registerCapability: capabilities.register,
  });
}
