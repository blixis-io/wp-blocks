import { describe, expect, it } from 'vitest';
import {
  ELEMENT_DEFINITIONS_V2,
  editorElementEntitlementV2,
  getElementDefinitionV2,
  isElementInsertableV2,
  validateElementTreeV2,
} from './v2.ts';

describe('generated v2 element registry', () => {
  it('loads all 253 definitions and separates ready from planned palette items', () => {
    expect(ELEMENT_DEFINITIONS_V2).toHaveLength(253);
    expect(getElementDefinitionV2('blixis/heading')?.id).toBe('heading');
    expect(isElementInsertableV2('blixis/heading')).toBe(true);
    expect(isElementInsertableV2('blixis/grid')).toBe(true);
    expect(isElementInsertableV2('blixis/div')).toBe(true);
    expect(isElementInsertableV2('blixis/div', true)).toBe(true);
    expect(isElementInsertableV2('blixis/flex')).toBe(false);
  });

  it('validates declared props and rejects undeclared and editor-only values', () => {
    const invalid = validateElementTreeV2([
      {
        id: 'heading-1',
        type: 'blixis/heading',
        props: { content: 'Hi', secret: true, elementId: 'x' },
        styles: {},
        children: [],
      },
    ]);
    expect(invalid.map((issue) => issue.code)).toEqual(['unknown-property', 'editor-only-property']);
    expect(
      validateElementTreeV2([
        { id: 'heading-1', type: 'blixis/heading', props: { content: 'Hi', tag: 'h2' }, styles: {}, children: [] },
      ]),
    ).toEqual([]);
  });

  it('defaults editor entitlement to available and allows a filter override', () => {
    expect(editorElementEntitlementV2('heading')).toBe('available');
    expect(editorElementEntitlementV2('heading', () => 'restricted')).toBe('restricted');
  });

  it('bounds trees and enforces unique safe ids', () => {
    const issues = validateElementTreeV2([
      { id: 'bad id', type: 'blixis/text', props: {}, styles: {}, children: [] },
      { id: 'bad id', type: 'blixis/text', props: {}, styles: {}, children: [] },
    ]);
    expect(issues.filter((issue) => issue.code === 'invalid-id')).toHaveLength(2);
  });
});
