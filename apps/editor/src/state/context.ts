import { createCoreRegistry, type ElementRegistry } from '@blixis/wp-element-registry';
import type { CommandContext, CommandError, CommandErrorCode } from '@blixis/wp-core';
import { readStorage, writeStorage } from '../storage';
import type { RestClient } from './deps';

/** The website breakpoints the canvas can emulate. Not the chrome and not the content locale: see the settings slice. */
export type Viewport = 'desktop' | 'tablet' | 'mobile';
export const VIEWPORTS: readonly Viewport[] = ['desktop', 'tablet', 'mobile'];
export type PreviewMode = 'light' | 'dark';

export interface BreakpointRegistry {
  /** Breakpoint id (as used in style rules; `base` = no breakpoint) and canvas width in CSS px (`null` = full width). */
  viewports: Readonly<Record<Viewport, { breakpoint: string; width: number | null }>>;
}

export const DEFAULT_BREAKPOINTS: BreakpointRegistry = {
  viewports: {
    desktop: { breakpoint: 'base', width: null },
    tablet: { breakpoint: 'tablet', width: 1024 },
    mobile: { breakpoint: 'mobile', width: 640 },
  },
};

export interface KeyValueStorage {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
}

/** What the store needs from the bootstrap (a subset, so tests do not build a complete one). */
export interface StoreBootstrap {
  postId: number;
  defaultLocale: string;
  enabledLocales: readonly string[];
  contentLocale: string;
  /** The link asked for `contentLocale` explicitly; only then it wins over the remembered locale. Default false. */
  contentLocaleExplicit?: boolean | undefined;
  pluginVersion: string;
  /** `false` when the document is locked: commands are refused. Defaults to `true`. */
  editingEnabled?: boolean;
  viewUrl?: string | null;
  seoPluginActive?: boolean;
}

export interface EditorStoreDeps {
  client: RestClient;
  bootstrap: StoreBootstrap;
  /** Element registry that supplies `canNest`, `sourceProperties` and `translationValue`. Defaults to the core elements. */
  registry?: ElementRegistry;
  /** Injected clock in milliseconds (coalescing window, skeleton timestamp). */
  now?: () => number;
  storage?: KeyValueStorage;
  breakpoints?: BreakpointRegistry;
  historyLimit?: number;
}

export interface ResolvedDeps {
  client: RestClient;
  bootstrap: StoreBootstrap;
  commandContext: CommandContext;
  now: () => number;
  storage: KeyValueStorage;
  breakpoints: BreakpointRegistry;
  historyLimit: number;
  editingEnabled: boolean;
  registry: ElementRegistry;
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function resolveDeps(deps: EditorStoreDeps): ResolvedDeps {
  const registry = deps.registry ?? createCoreRegistry();
  return {
    client: deps.client,
    bootstrap: deps.bootstrap,
    commandContext: {
      canNest: registry.canNest,
      sourceProperties: registry.sourceProperties,
      translationValue: registry.translationValue,
    },
    now: deps.now ?? Date.now,
    storage: deps.storage ?? { read: readStorage, write: writeStorage },
    breakpoints: deps.breakpoints ?? DEFAULT_BREAKPOINTS,
    historyLimit: deps.historyLimit ?? DEFAULT_HISTORY_LIMIT,
    editingEnabled: deps.bootstrap.editingEnabled ?? true,
    registry,
  };
}

/** Errors the bridge adds to core's command errors. */
export type BridgeErrorCode = CommandErrorCode | 'not-ready' | 'read-only';
export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}
export type { CommandError };
