/** Bounds on one declaration value. The scanner is linear; these keep memory and recursion small too. */
export const CSS_LIMITS = {
  /** Same limit as the document schema (`StyleRuleSchema`). */
  maxValueLength: 2048,
  maxComponents: 256,
  /** Nesting of functions and parentheses. */
  maxDepth: 8,
  maxDigits: 10,
} as const;

export type CssIssueCode =
  | 'unknown-property'
  | 'invalid-name'
  | 'empty-value'
  | 'value-too-long'
  | 'forbidden-character'
  | 'too-complex'
  | 'syntax'
  | 'forbidden-function'
  | 'forbidden-unit'
  | 'invalid-var'
  | 'invalid-value';

export interface CssFailure {
  code: CssIssueCode;
  message: string;
}
