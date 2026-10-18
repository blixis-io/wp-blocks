import type { ElementDefinition } from './definition.ts';
import { ElementRegistry } from './registry.ts';
import { ELEMENT_DEFINITIONS_V2 } from './v2.ts';

const everything = ['@layout', '@content', '@media', '@interactive'];
const inContainers = ['blixis/section', 'blixis/container'];

/**
 * The six elements of the Free builder (PRD section 6.2). These are definitions only: editors (BWB-054) and the PHP
 * renderers (BWB-043) are built against them. Text properties are translatable, links are locale-specific, everything that
 * is structure or presentation is invariant (FR-051).
 */
export const CORE_ELEMENTS: readonly ElementDefinition[] = [
  {
    type: 'blixis/section',
    version: 1,
    title: 'Section',
    category: 'layout',
    tier: 'free',
    requiresApi: 1,
    props: {
      tag: {
        kind: 'enum',
        classification: 'invariant',
        label: 'HTML element',
        values: ['section', 'header', 'footer', 'main', 'aside', 'nav', 'article'],
        default: 'section',
      },
    },
    styleProperties: [
      'margin',
      'padding',
      'width',
      'height',
      'display',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
      'background-color',
    ],
    allowedParents: ['#root'],
    allowedChildren: everything,
  },
  {
    type: 'blixis/container',
    version: 1,
    title: 'Container',
    category: 'layout',
    tier: 'free',
    requiresApi: 1,
    props: {
      maxWidth: {
        kind: 'enum',
        classification: 'invariant',
        label: 'Maximum width',
        values: ['narrow', 'default', 'wide', 'full'],
        default: 'default',
      },
    },
    styleProperties: [
      'margin',
      'padding',
      'width',
      'height',
      'display',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
      'background-color',
    ],
    allowedParents: inContainers,
    allowedChildren: everything,
  },
  {
    type: 'blixis/heading',
    version: 1,
    title: 'Heading',
    category: 'content',
    tier: 'free',
    requiresApi: 1,
    props: {
      level: {
        kind: 'integer',
        classification: 'invariant',
        label: 'Level',
        min: 1,
        max: 6,
        default: 2,
        required: true,
      },
      text: {
        kind: 'text',
        inline: true,
        classification: 'translatable',
        label: 'Text',
        maxLength: 500,
        default: 'Heading',
      },
    },
    styleProperties: [
      'font-family',
      'font-weight',
      'font-size',
      'line-height',
      'letter-spacing',
      'text-transform',
      'color',
      'margin',
      'padding',
      'width',
      'height',
      'text-align',
      'display',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
    ],
    allowedParents: inContainers,
    allowedChildren: [],
  },
  {
    type: 'blixis/text',
    version: 1,
    title: 'Text',
    category: 'content',
    tier: 'free',
    requiresApi: 1,
    props: {
      text: {
        kind: 'text',
        inline: true,
        classification: 'translatable',
        label: 'Text',
        maxLength: 5000,
        default: 'Write something',
      },
    },
    styleProperties: [
      'font-family',
      'font-weight',
      'font-size',
      'line-height',
      'letter-spacing',
      'text-transform',
      'color',
      'margin',
      'padding',
      'width',
      'height',
      'text-align',
      'display',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
    ],
    allowedParents: inContainers,
    allowedChildren: [],
  },
  {
    type: 'blixis/image',
    version: 1,
    title: 'Image',
    category: 'media',
    tier: 'free',
    requiresApi: 1,
    props: {
      attachmentId: { kind: 'media', classification: 'invariant', label: 'Image' },
      alt: { kind: 'string', classification: 'translatable', label: 'Alternative text', maxLength: 500, default: '' },
      decorative: { kind: 'boolean', classification: 'invariant', label: 'Decorative image', default: false },
    },
    styleProperties: [
      'margin',
      'padding',
      'width',
      'height',
      'display',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
    ],
    allowedParents: inContainers,
    allowedChildren: [],
  },
  {
    type: 'blixis/button',
    version: 1,
    title: 'Button',
    category: 'interactive',
    tier: 'free',
    requiresApi: 1,
    props: {
      label: {
        kind: 'text',
        inline: true,
        marks: ['strong', 'em', 'u', 's', 'code', 'style'],
        classification: 'translatable',
        label: 'Label',
        maxLength: 100,
        default: 'Button',
      },
      href: { kind: 'url', classification: 'locale-specific', label: 'Link', default: '#' },
      variant: {
        kind: 'enum',
        classification: 'invariant',
        label: 'Style',
        values: ['solid', 'outline', 'link'],
        default: 'solid',
      },
      newTab: { kind: 'boolean', classification: 'invariant', label: 'Open in a new tab', default: false },
    },
    styleProperties: [
      'font-family',
      'font-weight',
      'font-size',
      'line-height',
      'letter-spacing',
      'text-transform',
      'color',
      'background-color',
      'margin',
      'padding',
      'width',
      'height',
      'text-align',
      'display',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
    ],
    allowedParents: inContainers,
    allowedChildren: [],
  },
];

/** A registry holding the six core elements. Add-ons register their own on top of it. */
export function createCoreRegistry(): ElementRegistry {
  const registry = new ElementRegistry();
  for (const def of CORE_ELEMENTS) {
    const result = registry.register(def, 'core');
    if (!result.ok) throw new Error(`core element ${def.type} is invalid: ${result.errors.join('; ')}`);
  }
  return registry;
}

/** Editor registry extends stable core contracts with generated elements whose current editor/runtime slice is ready. */
export function createEditorRegistry(): ElementRegistry {
  const registry = createCoreRegistry();
  const editorReady = [
    'stack',
    'row',
    'flex',
    'aspect-ratio',
    'scroll-area',
    'sticky-container',
    'split-layout',
    'resizable-panels',
    'marquee-layout',
    'post-title',
    'post-content',
    'post-excerpt',
    'post-date',
    'post-author',
    'site-tagline',
    'post-terms',
    'icon-list',
    'icon',
    'icon-svg',
    'icon-button',
    'picture',
    'gallery',
    'lightbox',
    'code-block',
    'syntax-highlighter',
    'countdown',
    'animated-headline',
    'gradient-text',
    'tooltip-text',
    'columns',
    'grid',
    'card',
    'avatar',
    'site-logo',
    'div',
    'spacer',
    'separator',
    'list',
    'link',
    'paragraph',
    'rich-text',
    'eyebrow',
    'blockquote',
    'badge',
    'button-group',
    'counter',
    'progress-ring',
    'highlight-text',
    'steps',
    'breadcrumbs',
    'pagination',
    'progress',
    'spinner',
    'skeleton',
    'alert',
    'table-of-contents',
  ];
  const aliases = [
    {
      id: 'page',
      sourceId: 'section',
      category: 'layout',
      parents: ['#root'],
      children: ['@layout', '@content', '@media', '@interactive'],
    },
    {
      id: 'site-header',
      sourceId: 'sticky-header',
      category: 'layout',
      parents: ['blixis/page'],
      children: ['@layout', '@content', '@media', '@interactive'],
    },
    {
      id: 'site-footer',
      sourceId: 'section',
      category: 'layout',
      parents: ['blixis/page'],
      children: ['@layout', '@content', '@media', '@interactive'],
    },
    {
      id: 'navigation',
      sourceId: 'nav-menu',
      category: 'interactive',
      parents: ['blixis/page', 'blixis/site-header', 'blixis/site-footer', '@layout'],
      children: '',
    },
  ];
  const sources = [
    ...ELEMENT_DEFINITIONS_V2.filter((definition) => editorReady.includes(definition.id)),
    ...aliases.map((alias) => {
      const original = ELEMENT_DEFINITIONS_V2.find((definition) => definition.id === alias.sourceId);
      if (!original) throw new Error(`missing generated alias source ${alias.sourceId}`);
      return {
        ...original,
        id: alias.id,
        title: alias.id
          .split('-')
          .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
          .join(' '),
        category: alias.category,
        structure: {
          ...(original['structure'] as Record<string, unknown>),
          allowedParentTypes: alias.parents,
          allowedChildren: alias.children,
        },
      };
    }),
  ];
  for (const source of sources) {
    const raw = source as Record<string, unknown>;
    const structure = raw['structure'] as Record<string, unknown>;
    const definitions = raw['properties'] as Record<string, Record<string, unknown>>;
    const props: ElementDefinition['props'] = {};
    for (const [id, property] of Object.entries(definitions)) {
      if (property['editorOnly'] === true) continue;
      const type = String(property['type']);
      const classification = property['localizable'] === true ? 'translatable' : 'invariant';
      const base = {
        classification,
        label: typeof property['label'] === 'string' ? property['label'] : id,
        ...(property['required'] === true ? { required: true } : {}),
      } as const;
      if (type === 'string' || type === 'text' || type === 'richtext')
        props[id] = {
          ...base,
          kind: type === 'richtext' ? 'text' : 'string',
          ...(type === 'richtext'
            ? { inline: true, marks: ['strong', 'em', 'u', 's', 'code', 'link', 'style'] as const }
            : {}),
          maxLength: Number(property['maxLength'] ?? 5000),
          ...(typeof property['default'] === 'string' ? { default: property['default'] } : {}),
        } as ElementDefinition['props'][string];
      else if (type === 'boolean')
        props[id] = {
          ...base,
          kind: 'boolean',
          ...(typeof property['default'] === 'boolean' ? { default: property['default'] } : {}),
        };
      else if (type === 'integer' || type === 'number')
        props[id] = {
          ...base,
          kind: 'integer',
          min: Number(property['minimum'] ?? 0),
          max: Number(property['maximum'] ?? 10000),
          ...(typeof property['default'] === 'number' ? { default: Math.trunc(property['default']) } : {}),
        };
      else if (type === 'enum') {
        const values = Array.isArray(property['options'])
          ? property['options'].filter((value): value is string => typeof value === 'string')
          : [];
        if (values.length)
          props[id] = {
            ...base,
            kind: 'enum',
            values,
            ...(typeof property['default'] === 'string' ? { default: property['default'] } : {}),
          };
      } else if (type === 'url')
        props[id] = {
          ...base,
          kind: 'url',
          ...(typeof property['default'] === 'string' ? { default: property['default'] } : {}),
        };
      else if (type === 'asset-ref' || type === 'iconify-ref')
        props[id] = {
          ...base,
          kind: 'string',
          maxLength: 128,
          ...(typeof property['default'] === 'string' ? { default: property['default'] } : {}),
        };
      else if (type.startsWith('array<'))
        props[id] = {
          ...base,
          kind: 'json',
          ...(property['default'] !== undefined ? { default: property['default'] } : {}),
        };
    }
    const children = structure['allowedChildren'];
    const parents = structure['allowedParentTypes'];
    const def: ElementDefinition = {
      type: `blixis/${source.id}`,
      version: 1,
      title: String(raw['title']),
      category:
        raw['category'] === 'content'
          ? 'content'
          : raw['category'] === 'media'
            ? 'media'
            : raw['category'] === 'interactive'
              ? 'interactive'
              : 'layout',
      // Editor registration is permission to author static document data; tier stays on the generated palette metadata.
      // Entitlement does not gate insertion or rendering.
      tier: 'free',
      requiresApi: 1,
      props,
      styleProperties: Object.keys((raw['style'] as { allowed?: Record<string, unknown> } | undefined)?.allowed ?? {})
        .map((property) => property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
        .filter((property) =>
          [
            'font-family',
            'font-weight',
            'font-size',
            'line-height',
            'letter-spacing',
            'text-transform',
            'color',
            'margin',
            'padding',
            'width',
            'height',
            'text-align',
            'display',
            'border-radius',
            'border-width',
            'border-style',
            'border-color',
            'box-shadow',
            'background-color',
            'aspect-ratio',
            'flex-direction',
            'flex-wrap',
            'justify-content',
            'align-items',
            'grid-template-columns',
            'overflow-x',
            'overflow-y',
            'position',
            'min-height',
            'max-height',
          ].includes(property),
        ),
      allowedParents:
        source.id === 'page'
          ? ['#root']
          : source.id === 'site-header' || source.id === 'site-footer'
            ? ['blixis/page']
            : Array.isArray(parents)
              ? [
                  ...parents.map((value) =>
                    String(value).startsWith('#') ||
                    String(value).startsWith('@') ||
                    String(value).startsWith('blixis/')
                      ? String(value)
                      : `blixis/${String(value)}`,
                  ),
                  'blixis/site-header',
                  'blixis/site-footer',
                  'blixis/page',
                ]
              : ['#root'],
      allowedChildren:
        children === 'any'
          ? ['@layout', '@content', '@media', '@interactive']
          : Array.isArray(children)
            ? children.filter((value): value is string => typeof value === 'string')
            : [],
    };
    const result = registry.register(def, 'core');
    if (!result.ok) throw new Error(`generated editor definition ${def.type} is invalid: ${result.errors.join('; ')}`);
  }
  return registry;
}
