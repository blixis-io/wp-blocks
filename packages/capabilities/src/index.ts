/** Versioned feature and element capabilities shared by Builder and separately distributed extensions. */
export const CAPABILITY_API_VERSION = 1;

export type CapabilitySource = 'core' | 'plus' | 'pro' | 'vendor';
export type CapabilityTier = 'free' | 'plus' | 'pro';
export type CapabilityFallback = 'static' | 'retained' | 'unavailable';

export interface CapabilityDefinition {
  id: string;
  version: number;
  requiresApi: number;
  tier: CapabilityTier;
  /** Required for paid capabilities; mirrors the inactive-extension rendering contract in ADR 0009. */
  fallback?: CapabilityFallback;
}

export type CapabilityRegistration = { ok: true } | { ok: false; errors: string[] };

const ID_PATTERN = /^[a-z][a-z0-9-]{1,31}\/[a-z][a-z0-9-]{1,63}$/;
const SOURCE_NAMESPACE: Record<Exclude<CapabilitySource, 'vendor'>, string> = {
  core: 'blixis',
  plus: 'blixis-plus',
  pro: 'blixis-pro',
};
const SOURCE_TIER: Record<CapabilitySource, CapabilityTier> = {
  core: 'free',
  plus: 'plus',
  pro: 'pro',
  vendor: 'free',
};

function snapshot(input: unknown): unknown {
  return JSON.parse(JSON.stringify(input)) as unknown;
}

function validate(input: unknown, source: CapabilitySource): { value?: CapabilityDefinition; errors: string[] } {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch {
    return { errors: ['definition must be safe JSON'] };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return { errors: ['definition must be an object'] };
  const candidate = value as Record<string, unknown>;
  const allowed = new Set(['id', 'version', 'requiresApi', 'tier', 'fallback']);
  const errors: string[] = [];
  if (Object.keys(candidate).some((key) => !allowed.has(key))) errors.push('definition contains unknown fields');
  if (typeof candidate['id'] !== 'string' || !ID_PATTERN.test(candidate['id'])) errors.push('id is invalid');
  if (!Number.isSafeInteger(candidate['version']) || (candidate['version'] as number) < 1)
    errors.push('version must be a positive integer');
  if (!Number.isSafeInteger(candidate['requiresApi']) || (candidate['requiresApi'] as number) < 1)
    errors.push('requiresApi must be a positive integer');
  if ((candidate['requiresApi'] as number) > CAPABILITY_API_VERSION)
    errors.push(`requiresApi exceeds capability API ${String(CAPABILITY_API_VERSION)}`);
  if (!['free', 'plus', 'pro'].includes(String(candidate['tier']))) errors.push('tier is invalid');
  if (
    candidate['fallback'] !== undefined &&
    (typeof candidate['fallback'] !== 'string' ||
      !['static', 'retained', 'unavailable'].includes(candidate['fallback']))
  )
    errors.push('fallback is invalid');
  if (candidate['tier'] === 'free' && candidate['fallback'] !== undefined)
    errors.push('free capabilities must not declare a paid fallback');
  if (candidate['tier'] !== 'free' && candidate['fallback'] === undefined)
    errors.push('paid capabilities require a fallback class');
  if (typeof candidate['id'] === 'string') {
    const namespace = candidate['id'].split('/')[0] ?? '';
    if (source === 'vendor') {
      if (namespace.startsWith('blixis')) errors.push('Blixis namespaces are reserved');
    } else if (namespace !== SOURCE_NAMESPACE[source]) {
      errors.push(`${source} capabilities must use the ${SOURCE_NAMESPACE[source]}/ namespace`);
    }
  }
  if (candidate['tier'] !== SOURCE_TIER[source])
    errors.push(`${source} capabilities must use tier ${SOURCE_TIER[source]}`);
  return errors.length ? { errors } : { value: candidate as unknown as CapabilityDefinition, errors };
}

/** Immutable-by-copy capability registry; availability from the server remains authoritative. */
export class CapabilityRegistry {
  readonly #definitions = new Map<string, CapabilityDefinition>();

  register(input: unknown, source: CapabilitySource): CapabilityRegistration {
    const result = validate(input, source);
    if (!result.value) return { ok: false, errors: result.errors };
    if (this.#definitions.has(result.value.id))
      return { ok: false, errors: [`${result.value.id} is already registered`] };
    this.#definitions.set(result.value.id, Object.freeze({ ...result.value }));
    return { ok: true };
  }

  get(id: string): CapabilityDefinition | undefined {
    return this.#definitions.get(id);
  }

  list(): CapabilityDefinition[] {
    return [...this.#definitions.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  manifest(): { apiVersion: number; capabilities: CapabilityDefinition[] } {
    return { apiVersion: CAPABILITY_API_VERSION, capabilities: this.list() };
  }

  registrarFor(source: CapabilitySource): { register: (definition: unknown) => CapabilityRegistration } {
    return { register: (definition) => this.register(definition, source) };
  }
}

/** Server-generated entitlement data. Clients can display it but never grant access with it. */
export interface CapabilitySnapshot {
  apiVersion: number;
  entitlements: Readonly<Record<string, boolean>>;
}

export function hasServerCapability(snapshotValue: CapabilitySnapshot | null | undefined, id: string): boolean {
  return snapshotValue?.apiVersion === CAPABILITY_API_VERSION && snapshotValue.entitlements[id] === true;
}
