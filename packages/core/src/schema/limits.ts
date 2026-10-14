/**
 * Hard limits for documents (docs/architecture/DOCUMENT-SCHEMA.md). JSON Schema cannot express most of them, so every
 * entry point (TypeScript editor, REST handlers, PHP renderer) MUST enforce the byte limit before decoding and the depth
 * and node limits before trusting a document: a document that merely passes the shape check is not yet safe input.
 * `validateDocument` (BWB-020) applies all of them.
 */
export const DOCUMENT_LIMITS = {
  /** Serialised size of one document. Check before decoding. */
  maxBytes: 2 * 1024 * 1024,
  /**
   * Container nesting of the JSON text. Every element level costs two (the element object and its `children` array), plus
   * the document object and the `root` array and some room for nested property values, so this must stay above
   * `2 * maxTreeDepth + 2` (a test enforces it).
   */
  maxJsonDepth: 128,
  /** Element tree depth. */
  maxTreeDepth: 32,
  /** Elements in one document. */
  maxNodes: 5000,
  /** Declarations in one style rule. Also enforced by the JSON Schema (`maxProperties`). */
  maxDeclarationsPerRule: 64,
} as const;
