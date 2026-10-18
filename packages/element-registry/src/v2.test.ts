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
    expect(isElementInsertableV2('blixis/flex')).toBe(true);
    expect(isElementInsertableV2('blixis/aspect-ratio')).toBe(true);
    expect(isElementInsertableV2('blixis/scroll-area')).toBe(true);
    expect(isElementInsertableV2('blixis/div')).toBe(true);
    expect(isElementInsertableV2('blixis/div', true)).toBe(true);
    expect(isElementInsertableV2('blixis/list')).toBe(true);
    expect(isElementInsertableV2('blixis/link')).toBe(true);
    expect(isElementInsertableV2('blixis/steps')).toBe(true);
    expect(isElementInsertableV2('blixis/progress')).toBe(true);
    expect(isElementInsertableV2('blixis/spinner')).toBe(true);
    expect(isElementInsertableV2('blixis/skeleton')).toBe(true);
    expect(isElementInsertableV2('blixis/video')).toBe(true);
    expect(isElementInsertableV2('blixis/audio')).toBe(true);
    expect(isElementInsertableV2('blixis/empty-state')).toBe(true);
    expect(isElementInsertableV2('blixis/keyboard-shortcut')).toBe(true);
    expect(isElementInsertableV2('blixis/timeline')).toBe(true);
    expect(isElementInsertableV2('blixis/avatar')).toBe(true);
    expect(isElementInsertableV2('blixis/alert')).toBe(true);
    expect(isElementInsertableV2('blixis/table-of-contents')).toBe(true);
    expect(isElementInsertableV2('blixis/sticky-container')).toBe(true);
    expect(isElementInsertableV2('blixis/split-layout')).toBe(true);
    expect(isElementInsertableV2('blixis/resizable-panels')).toBe(true);
    expect(isElementInsertableV2('blixis/marquee-layout')).toBe(true);
    for (const type of [
      'post-title',
      'post-content',
      'post-excerpt',
      'post-date',
      'post-author',
      'site-tagline',
      'post-terms',
    ]) {
      expect(isElementInsertableV2(`blixis/${type}`)).toBe(true);
    }
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
    expect(
      validateElementTreeV2([
        { id: 'logo-1', type: 'blixis/site-logo', props: { assetRef: 'brand' }, styles: {}, children: [] },
      ]),
    ).toEqual([]);
  });

  it('accepts only manifest keys or attachment IDs for media references', () => {
    expect(
      validateElementTreeV2([
        {
          id: 'video-1',
          type: 'blixis/video',
          props: { src: 'attachment:42', poster: null },
          styles: {},
          children: [],
        },
      ]),
    ).toEqual([]);
    expect(
      validateElementTreeV2([
        {
          id: 'video-2',
          type: 'blixis/video',
          props: { src: 'https://evil.test/video.mp4' },
          styles: {},
          children: [],
        },
      ]).map((issue) => issue.code),
    ).toEqual(['invalid-property']);
  });

  it('validates arrays using their declared item type', () => {
    expect(
      validateElementTreeV2([
        {
          id: 'avatar-group-1',
          type: 'blixis/avatar-group',
          props: { assets: ['attachment:42', 'asset:profile'] },
          styles: {},
          children: [],
        },
      ]),
    ).toEqual([]);
    expect(
      validateElementTreeV2([
        {
          id: 'avatar-group-2',
          type: 'blixis/avatar-group',
          props: { assets: ['javascript:alert(1)'] },
          styles: {},
          children: [],
        },
      ]).map((issue) => issue.code),
    ).toEqual(['invalid-property']);
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
