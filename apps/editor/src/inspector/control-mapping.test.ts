import { createCoreRegistry } from '@blixis/wp-element-registry';
import { describe, expect, it } from 'vitest';
import { controlFamilyFor, propertyBelongsToTab } from './control-mapping';

const registry = createCoreRegistry();

describe('schema to inspector control mapping', () => {
  it('maps every core property kind to a control family', () => {
    const kinds = new Set<string>();
    for (const type of [
      'blixis/section',
      'blixis/container',
      'blixis/heading',
      'blixis/text',
      'blixis/image',
      'blixis/button',
    ]) {
      const definition = registry.get(type);
      expect(definition).toBeDefined();
      for (const property of Object.values(definition?.props ?? {})) {
        kinds.add(property.kind);
        expect(['text', 'number', 'choice', 'media']).toContain(controlFamilyFor(property));
      }
    }
    expect(kinds).toEqual(new Set(['string', 'text', 'url', 'integer', 'enum', 'boolean', 'media']));
  });

  it('places schema-backed text and invariant properties in Content; Advanced stays empty', () => {
    const heading = registry.get('blixis/heading');
    expect(heading).toBeDefined();
    const text = heading?.props['text'];
    const level = heading?.props['level'];
    expect(text && propertyBelongsToTab('text', text, 'content')).toBe(true);
    expect(text && propertyBelongsToTab('text', text, 'advanced')).toBe(false);
    expect(level && propertyBelongsToTab('level', level, 'advanced')).toBe(false);
    expect(level && propertyBelongsToTab('level', level, 'content')).toBe(true);
  });

  it('keeps attachment identity in Content despite invariant classification', () => {
    const image = registry.get('blixis/image');
    expect(image).toBeDefined();
  });
});
