import { admitValue, type ElementNode, type Json, type TranslationCheck } from '@blixis/wp-core';
import {
  EXTENSION_API_VERSION,
  ElementDefinitionSchema,
  valueSchemaFor,
  type ElementDefinition,
  type PropDefinition,
} from './definition.ts';

/** Who is registering. Decides which namespace and tier a definition may use. */
export type Source = 'core' | 'plus' | 'pro' | 'vendor';

const NAMESPACE = { core: 'blixis', plus: 'blixis-plus', pro: 'blixis-pro' } as const;
const TIER = { core: 'free', plus: 'plus', pro: 'pro', vendor: 'free' } as const;

export type RegisterResult = { ok: true } | { ok: false; errors: string[] };

export type PropIssueCode =
  'unknown-property' | 'translatable-property-in-props' | 'missing-required-property' | 'invalid-property-value';

/** A problem with one invariant property. The code is stable; the message is for humans. */
export interface PropIssue {
  code: PropIssueCode;
  property: string;
  message: string;
}

export interface Defaults {
  /** Invariant property defaults, stored in `props`. */
  props: Record<string, Json>;
  /** Translatable and locale-specific defaults, to be written into the editing locale's translation stream. */
  translatable: Record<string, Json>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Does a nesting entry (`#root`, `@category`, or a type) match this element (`null` = the page root)? */
const matches = (entry: string, element: ElementDefinition | null): boolean =>
  element === null ? entry === '#root' : entry === element.type || entry === `@${element.category}`;

function checkDefinition(def: ElementDefinition, source: Source): string[] {
  const errors: string[] = [];
  const [vendor = ''] = def.type.split('/');
  if (source === 'vendor') {
    if (vendor.startsWith('blixis')) errors.push(`the namespace "${vendor}" is reserved for Blixis packages`);
  } else if (vendor !== NAMESPACE[source]) {
    errors.push(`a ${source} element must use the namespace "${NAMESPACE[source]}/", not "${vendor}/"`);
  }
  if (def.tier !== TIER[source])
    errors.push(`a ${source} element must declare tier "${TIER[source]}", not "${def.tier}"`);
  if (def.tier === 'free' && def.fallback !== undefined) errors.push('free elements must not declare a fallback class');
  if (def.tier !== 'free' && def.fallback === undefined)
    errors.push('plus and pro elements must declare a fallback class (static, retained or unavailable; ADR 0009)');
  if (def.requiresApi > EXTENSION_API_VERSION)
    errors.push(
      `requires extension API ${String(def.requiresApi)}, but this is version ${String(EXTENSION_API_VERSION)}`,
    );
  for (const [name, prop] of Object.entries(def.props)) {
    const where = `property ${name}`;
    if (prop.classification === 'translatable' && prop.kind !== 'string')
      errors.push(`${where}: only string properties can be translatable`);
    if (prop.classification === 'locale-specific' && !['string', 'url', 'media'].includes(prop.kind))
      errors.push(`${where}: ${prop.kind} properties cannot be locale-specific`);
    if (prop.kind === 'integer' && prop.min > prop.max) errors.push(`${where}: min is greater than max`);
    if (prop.required === true && prop.classification !== 'invariant')
      errors.push(
        `${where}: only invariant properties can be required (translated values are checked per language by the translation workflow)`,
      );
    if (prop.required === true && prop.default === undefined)
      errors.push(`${where}: a required property needs a default so new elements can be created`);
    if (prop.default !== undefined && !valueSchemaFor(prop).safeParse(prop.default).success)
      errors.push(`${where}: the default value is not valid for the property`);
  }
  return errors;
}

/**
 * The set of element types the editor and renderers know (docs/architecture/EXTENSION-API.md). Definitions are validated
 * when registered, frozen, and never change afterwards. Unknown types found in stored documents are preserved and only
 * produce warnings (ADR 0003: no silent loss); the editor simply cannot create them.
 */
export class ElementRegistry {
  readonly #definitions = new Map<string, ElementDefinition>();

  /** Validates and adds a definition. Never throws; reports every problem. */
  register(input: unknown, source: Source): RegisterResult {
    // One inert, bounded copy first: a hostile object (getter, Proxy, reserved key) becomes an error, never an exception.
    const admitted = admitValue(input);
    if (!admitted.ok)
      return { ok: false, errors: admitted.issues.slice(0, 5).map((i) => `definition: ${i.code}: ${i.message}`) };
    const parsed = ElementDefinitionSchema.safeParse(admitted.value);
    if (!parsed.success) {
      return {
        ok: false,
        errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || 'definition'}: ${i.message}`),
      };
    }
    const def = parsed.data;
    const errors = checkDefinition(def, source);
    if (this.#definitions.has(def.type)) errors.push(`${def.type} is already registered`);
    if (errors.length > 0) return { ok: false, errors };
    this.#definitions.set(def.type, deepFreeze(structuredClone(def)));
    return { ok: true };
  }

  has(type: string): boolean {
    return this.#definitions.has(type);
  }

  get(type: string): ElementDefinition | undefined {
    return this.#definitions.get(type);
  }

  /** All definitions, sorted by type. */
  list(): ElementDefinition[] {
    return [...this.#definitions.values()].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  }

  /**
   * May an element of `childType` be placed inside `parentType` (`null` = the page root)? Both types must be registered
   * (an unknown parent or child cannot be edited), the parent must accept the child, and the child must accept the parent.
   * This is the `canNest` hook of the document commands. With `intent: 'relocate'` (moving or restoring existing content) an
   * *unknown* child, for example an element of a removed add-on, may still be moved to the page root or into a known
   * container, so such documents can be rearranged; it is never allowed under a leaf or an unknown parent, and new unknown
   * elements can never be created (`intent: 'create'`).
   */
  canNest = (parentType: string | null, childType: string, intent: 'create' | 'relocate' = 'create'): boolean => {
    const child = this.#definitions.get(childType);
    const parent = parentType === null ? null : this.#definitions.get(parentType);
    if (parent === undefined) return false;
    if (child === undefined) return intent === 'relocate' && (parent === null || parent.allowedChildren.length > 0);
    const parentAccepts = parent === null ? true : parent.allowedChildren.some((entry) => matches(entry, child));
    const childAccepts = child.allowedParents.some((entry) => matches(entry, parent));
    return parentAccepts && childAccepts;
  };

  /**
   * The properties whose values live in the translation streams (translatable and locale-specific), in definition order, with
   * the ids that stored translations are keyed by. Ids are permanent (docs/architecture/VERSIONING-AND-COMPATIBILITY.md).
   */
  localizedProperties(
    type: string,
  ): { id: string; kind: string; classification: 'translatable' | 'locale-specific' }[] {
    const def = this.#definitions.get(type);
    if (def === undefined) return [];
    return Object.entries(def.props).flatMap(([id, prop]) =>
      prop.classification === 'invariant' ? [] : [{ id, kind: prop.kind, classification: prop.classification }],
    );
  }

  /**
   * The ids of the properties of `type` that count as source text when deciding whether a translation is stale: the
   * translatable ones. Locale-specific values (links, media) are meant to differ per language. This is the `sourceProperties`
   * hook of the document commands.
   */
  sourceProperties = (type: string): string[] =>
    this.localizedProperties(type)
      .filter((p) => p.classification === 'translatable')
      .map((p) => p.id);

  /**
   * May `property` of an element of `type` hold `value` in a translation entry? This is the `translationValue` hook of the
   * document commands (`set-translation`) and the rule `checkAgainstRegistry` applies to stored translations: only translatable
   * and locale-specific properties of registered types, with a value their definition accepts.
   */
  translationValue = (type: string, property: string, value: Json): TranslationCheck => {
    const def = this.#definitions.get(type);
    const prop = def !== undefined && Object.hasOwn(def.props, property) ? def.props[property] : undefined;
    if (prop === undefined || prop.classification === 'invariant') {
      return {
        ok: false,
        code: 'not-translatable',
        message: `${property} is not a translatable or locale-specific property of ${type}`,
      };
    }
    const messages = describe(property, prop, value);
    return messages.length === 0
      ? { ok: true }
      : { ok: false, code: 'invalid-translation', message: messages.join('; ') };
  };

  /** Default values for a new element, split by where they are stored. */
  defaultsFor(type: string): Defaults | undefined {
    const def = this.#definitions.get(type);
    if (def === undefined) return undefined;
    const out: Defaults = { props: {}, translatable: {} };
    for (const [name, prop] of Object.entries(def.props)) {
      if (prop.default === undefined) continue;
      const target = prop.classification === 'invariant' ? out.props : out.translatable;
      Object.defineProperty(target, name, {
        value: prop.default,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }

  /** A new element with its invariant defaults (translatable defaults come from `defaultsFor`). */
  createElement(type: string, id: string): ElementNode | undefined {
    const defaults = this.defaultsFor(type);
    return defaults === undefined ? undefined : { id, type, props: defaults.props, children: [] };
  }

  /** Problems with a set of invariant `props` for `type`, with stable codes; empty = valid. Unknown types are not an error here. */
  propIssues(type: string, props: Record<string, unknown>): PropIssue[] {
    const def = this.#definitions.get(type);
    if (def === undefined) return [];
    const issues: PropIssue[] = [];
    for (const [name, value] of Object.entries(props)) {
      const prop = Object.hasOwn(def.props, name) ? def.props[name] : undefined;
      if (prop === undefined)
        issues.push({ code: 'unknown-property', property: name, message: `${name}: not a property of ${type}` });
      else if (prop.classification !== 'invariant') {
        issues.push({
          code: 'translatable-property-in-props',
          property: name,
          message: `${name}: is ${prop.classification} and belongs in the translation streams, not in props`,
        });
      } else {
        for (const message of describe(name, prop, value))
          issues.push({ code: 'invalid-property-value', property: name, message });
      }
    }
    for (const [name, prop] of Object.entries(def.props)) {
      if (prop.classification === 'invariant' && prop.required === true && !Object.hasOwn(props, name)) {
        issues.push({ code: 'missing-required-property', property: name, message: `${name}: is required` });
      }
    }
    return issues;
  }

  /** The messages of `propIssues`; empty = valid. */
  validateProps(type: string, props: Record<string, unknown>): string[] {
    return this.propIssues(type, props).map((i) => i.message);
  }

  /**
   * A handle that registers with a fixed, host-assigned source. The host (the plugin loader) must give add-on code only this
   * handle: `source` is a claim of identity that this class cannot verify, so it must never come from an add-on's payload.
   */
  registrarFor(source: Source): { register: (input: unknown) => RegisterResult } {
    return { register: (input) => this.register(input, source) };
  }

  /** JSON-safe description of every definition, for the REST API and the PHP side (GET /elements: no executable code). */
  manifest(): { apiVersion: number; elements: ElementDefinition[] } {
    return { apiVersion: EXTENSION_API_VERSION, elements: this.list() };
  }
}

/** Problems with one value; empty = valid. */
export function describe(name: string, prop: PropDefinition, value: unknown): string[] {
  const result = valueSchemaFor(prop).safeParse(value);
  return result.success ? [] : [`${name}: ${result.error.issues[0]?.message ?? 'invalid value'}`];
}
