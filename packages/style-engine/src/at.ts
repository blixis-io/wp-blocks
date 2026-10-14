/** Element of a list that the caller has already shown to exist (a loop index, a non-empty stack). */
export function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new RangeError(`no element at index ${String(index)}`);
  return value;
}
