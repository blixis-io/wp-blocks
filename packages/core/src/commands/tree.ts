import type { ElementNode } from '../schema/document.ts';

/** Index path from the document root to an element: `[2, 0]` is `root[2].children[0]`. */
export type Path = number[];

/** Finds an element's index path with an iterative walk (no recursion on user-shaped trees). */
export function findPath(root: readonly ElementNode[], id: string): Path | null {
  const stack: { nodes: readonly ElementNode[]; path: Path }[] = [{ nodes: root, path: [] }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    for (let i = 0; i < frame.nodes.length; i += 1) {
      const node = frame.nodes[i];
      if (node === undefined) continue;
      if (node.id === id) return [...frame.path, i];
      if (node.children.length > 0) stack.push({ nodes: node.children, path: [...frame.path, i] });
    }
  }
  return null;
}

export function nodeAt(root: readonly ElementNode[], path: Path): ElementNode | undefined {
  let nodes: readonly ElementNode[] = root;
  let node: ElementNode | undefined;
  for (const index of path) {
    node = nodes[index];
    if (node === undefined) return undefined;
    nodes = node.children;
  }
  return node;
}

/** Returns a new root where the child list at `parentPath` (`[]` = top level) is replaced; untouched subtrees are shared. */
export function withChildren(
  root: readonly ElementNode[],
  parentPath: Path,
  update: (list: ElementNode[]) => ElementNode[],
): ElementNode[] {
  if (parentPath.length === 0) return update([...root]);
  const [head, ...rest] = parentPath;
  const target = head === undefined ? undefined : root[head];
  if (head === undefined || target === undefined) throw new Error('path does not exist');
  const copy = [...root];
  copy[head] = { ...target, children: withChildren(target.children, rest, update) };
  return copy;
}

/** Returns a new root where the element at `path` is replaced. */
export function replaceNode(
  root: readonly ElementNode[],
  path: Path,
  update: (node: ElementNode) => ElementNode,
): ElementNode[] {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  if (index === undefined) throw new Error('empty path');
  return withChildren(root, parentPath, (list) => {
    const node = list[index];
    if (node === undefined) throw new Error('path does not exist');
    list[index] = update(node);
    return list;
  });
}

/** Every element id in a subtree, including its root. Iterative. */
export function subtreeIds(node: ElementNode): string[] {
  const ids: string[] = [];
  const stack: ElementNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    ids.push(current.id);
    for (const child of current.children) stack.push(child);
  }
  return ids;
}

/** Number of elements and maximum depth of a list of subtrees (depth of a lone element is 1). */
export function measure(nodes: readonly ElementNode[]): { count: number; depth: number } {
  let count = 0;
  let depth = 0;
  const stack: { node: ElementNode; depth: number }[] = nodes.map((node) => ({ node, depth: 1 }));
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    count += 1;
    depth = Math.max(depth, item.depth);
    for (const child of item.node.children) stack.push({ node: child, depth: item.depth + 1 });
  }
  return { count, depth };
}
