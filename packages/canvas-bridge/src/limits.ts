/** Protocol version spoken by this package. A message with another version is refused. */
export const PROTOCOL_VERSION = 1;

/** Message type names of the two handshake messages (the only ones that travel over `window.postMessage`). */
export const HELLO_TYPE = 'blx-canvas-hello';
export const INIT_TYPE = 'blx-canvas-init';

/** Bounds of every field. They mirror the preview route caps (1 MiB HTML, 256 KiB CSS) and are enforced on both ends. */
export const LIMITS = {
  /** Length of the handshake nonce. */
  nonceMin: 16,
  nonceMax: 64,
  /** Characters (UTF-16 code units) of a rendered HTML fragment. */
  htmlMax: 1_048_576,
  /** Characters of the compiler CSS. */
  cssMax: 262_144,
  viewportWidthMin: 200,
  viewportWidthMax: 4000,
  /** Largest reported canvas dimension in CSS px. */
  sizeMax: 100_000,
  /** Largest number of element rectangles in one `rects` message. */
  rectsMax: 5000,
  /** Rectangle coordinates are finite numbers within plus or minus this value. */
  coordinateMax: 1_000_000,
  localeMax: 20,
  /** Invalid port messages tolerated before an endpoint closes itself. */
  invalidMessagesMax: 20,
  /** Canvas shortcut protocol name is a single closed enum value. */
  shortcutNameMax: 4,
  /** Default time the parent waits for the canvas hello. */
  handshakeTimeoutMs: 10_000,
} as const;

/**
 * Element ids: core's `ID_PATTERN` (anchored, 3 to 64 characters, no prototype-pollution names). It is copied, not imported,
 * because importing `@blixis/wp-core` would bundle zod (about 450 KiB) into the canvas runtime; `messages.test.ts` fails when the
 * two drift apart.
 */
export const ELEMENT_ID_PATTERN = '^(?!(?:__proto__|constructor|prototype)$)[a-z0-9][a-z0-9_-]{2,63}$';

/** Breakpoint ids as used by the style rules (`base` is allowed here because it is the desktop viewport). */
export const BREAKPOINT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
/** WordPress locale ids exactly as the editor bootstrap accepts them. */
export const LOCALE_PATTERN = /^[a-z]{2,3}(?:_[A-Za-z0-9]{2,8})*$/;

/** The closed list of canvas error codes. The canvas never sends free text. */
export const CANVAS_ERROR_CODES = [
  'unsafe-html',
  'unsafe-css',
  'too-large',
  'render-failed',
  'invalid-message',
  'internal',
] as const;
export type CanvasErrorCode = (typeof CANVAS_ERROR_CODES)[number];

/** Why an endpoint reported to its owner. */
export type ViolationReason = 'protocol-violation' | 'handshake-timeout' | 'handshake-failed';
