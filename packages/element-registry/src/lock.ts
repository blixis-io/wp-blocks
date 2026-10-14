/** Released property ids of a set of element types: `type -> property id -> classification and kind`. */
export interface PropertyIdLock {
  lockVersion: 1;
  elements: Record<string, Record<string, { classification: string; kind: string }>>;
}

/**
 * Compares definitions with a lock of released property ids and returns the problems: a locked id that is gone or changed
 * classification or kind (stored content and translations are keyed by property id, so that is a breaking change), a locked
 * element type that disappeared, and, with `requireRecorded`, a property that the lock does not record yet. Add-on authors can
 * keep their own lock file and run this in their tests (docs/architecture/VERSIONING-AND-COMPATIBILITY.md).
 */
export function comparePropertyIds(
  lock: PropertyIdLock,
  definitions: readonly { type: string; props: Readonly<Record<string, { classification: string; kind: string }>> }[],
  options: { requireRecorded?: boolean } = {},
): string[] {
  const problems: string[] = [];
  for (const [type, props] of Object.entries(lock.elements)) {
    const def = definitions.find((d) => d.type === type);
    if (def === undefined) {
      problems.push(`${type}: element removed`);
      continue;
    }
    for (const [id, expected] of Object.entries(props)) {
      const prop = Object.hasOwn(def.props, id) ? def.props[id] : undefined;
      if (prop === undefined) problems.push(`${type}.${id}: property removed`);
      else if (prop.classification !== expected.classification || prop.kind !== expected.kind) {
        problems.push(
          `${type}.${id}: changed from ${expected.classification} ${expected.kind} to ${prop.classification} ${prop.kind}`,
        );
      }
    }
  }
  if (options.requireRecorded === true) {
    for (const def of definitions) {
      for (const id of Object.keys(def.props)) {
        if (!Object.hasOwn(lock.elements[def.type] ?? {}, id))
          problems.push(`${def.type}.${id}: not recorded in the lock`);
      }
    }
  }
  return problems;
}
