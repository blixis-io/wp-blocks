/** Shared canonical document number rules for TypeScript and PHP. */
export const MAX_DECIMAL_MAGNITUDE = 1_000_000_000;
export const MAX_DECIMAL_PLACES = 4;
export const MIN_DECIMAL_MAGNITUDE = 0.0001;

/** Integers retain the safe-integer contract; decimals use a bounded four-place decimal grid. */
export function isSafeJsonNumber(value: number): boolean {
  if (Object.is(value, -0)) return false;
  if (Number.isSafeInteger(value)) return true;
  if (!Number.isFinite(value) || Math.abs(value) > MAX_DECIMAL_MAGNITUDE || Math.abs(value) < MIN_DECIMAL_MAGNITUDE)
    return false;
  return Math.round(value * 10 ** MAX_DECIMAL_PLACES) / 10 ** MAX_DECIMAL_PLACES === value;
}

/** Produce the plain decimal representation shared by canonical JSON in PHP and TypeScript. */
export function serializeJsonNumber(value: number): string {
  if (!isSafeJsonNumber(value)) throw new Error(`unsupported JSON number ${String(value)}`);
  if (Number.isSafeInteger(value)) return String(value);
  return value.toFixed(MAX_DECIMAL_PLACES).replace(/0+$/, '').replace(/\.$/, '');
}
