import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const sourceRoot = join(import.meta.dirname, '.');
function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.isFile() && entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('native title tooltip guard', () => {
  it('keeps title attributes off JSX elements (except iframe and SVG/HTML title)', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(sourceRoot)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : '';
          if (tag.toLowerCase() === tag && tag !== 'iframe' && tag !== 'title') {
            for (const attribute of node.attributes.properties) {
              if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'title') {
                const line = source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1;
                violations.push(`${path}:${String(line)}`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
