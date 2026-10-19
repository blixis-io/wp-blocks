import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { format, resolveConfig } from 'prettier';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const definitionsDir = path.join(root, 'docs/elements');
const solarPackage = path.join(root, 'packages/editor-ui/node_modules/@iconify-icons/solar/package.json');
const outputs = [
  ['packages/element-registry/manifest/element-definitions-v2.json', 'manifest'],
  ['wordpress/plugin/data/element-definitions-v2.json', 'manifest'],
  ['packages/element-registry/src/generated-element-types.ts', 'types'],
  ['packages/element-registry/manifest/palette-catalog.json', 'palette'],
  ['docs/elements/reports/icon-mismatches.json', 'icons'],
];

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const schema = await readJson(path.join(definitionsDir, 'schemas/element-definition.schema.json'));
const catalog = await readJson(path.join(definitionsDir, 'catalog.json'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const packageData = await readJson(solarPackage);
const iconExports = new Set(
  Object.keys(packageData.exports)
    .filter((key) => key !== '.' && key !== './package.json')
    .map((key) => key.slice(2)),
);
const definitions = [];
const editorReady = new Set([
  'page',
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
  'site-title',
  'site-search',
  'post-terms',
  'featured-image',
  'comments-list',
  'query-loop',
  'query-pagination',
  'related-posts',
  'author-box',
  'table-of-posts',
  'dynamic-tag',
  'user-profile',
  'entrance-animation',
  'scroll-reveal',
  'hover-tilt',
  'scroll-timeline',
  'stagger-container',
  'typing-indicator',
  'horizontal-scroll',
  'logo-marquee',
  'scroll-snap-carousel',
  'reading-progress',
  'number-ticker',
  'scroll-progress',
  'show-more',
  'icon-list',
  'icon',
  'icon-svg',
  'icon-button',
  'picture',
  'before-after',
  'image-comparison',
  'image-hotspots',
  'panorama-360',
  'video-background',
  'map',
  'embed',
  'iframe',
  'pdf-viewer',
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
  'navigation',
  'nav-menu',
  'anchor-links',
  'navigation-menu',
  'sidebar-navigation',
  'scroll-spy',
  'collapsible',
  'table-of-contents',
  'mega-menu',
  'wizard-steps',
  'offcanvas',
  'tabs',
  'accordion',
  'mobile-menu',
  'sticky-header',
  'back-to-top',
  'site-header',
  'site-footer',
  'site-logo',
  'button',
  'container',
  'heading',
  'paragraph',
  'rich-text',
  'eyebrow',
  'blockquote',
  'badge',
  'button-group',
  'counter',
  'progress-ring',
  'highlight-text',
  'image',
  'video',
  'audio',
  'empty-state',
  'keyboard-shortcut',
  'switch',
  'checkbox',
  'radio-group',
  'select',
  'toggle',
  'toggle-group',
  'segmented-control',
  'slider',
  'combobox',
  'input',
  'textarea',
  'date-picker',
  'date-range-picker',
  'data-table',
  'sortable-table',
  'chart',
  'stat-card',
  'toast',
  'notification-center',
  'avatar-group',
  'popover',
  'tooltip',
  'hover-card',
  'dialog',
  'alert-dialog',
  'drawer',
  'sheet',
  'dropdown-menu',
  'command-palette',
  'carousel',
  'rating',
  'breadcrumb-ui',
  'scroll-indicator',
  'copy-button',
  'range-slider',
  'label',
  'context-menu',
  'calendar',
  'loading-button',
  'timeline',
  'section',
  'text',
  'div',
  'spacer',
  'separator',
  'list',
  'link',
  'steps',
  'breadcrumbs',
  'pagination',
  'progress',
  'spinner',
  'skeleton',
  'alert',
  'table-of-contents',
  'form',
  'text-field',
  'email-field',
  'number-field',
  'url-field',
  'search-field',
  'hidden-field',
  'submit-button',
  'form-success',
  'form-error',
  'newsletter-signup',
  'contact-form',
]);
for (const entry of catalog.elements) {
  const definition = await readJson(path.join(definitionsDir, entry.file));
  if (!validate(definition)) throw new Error(`${entry.file}: ${ajv.errorsText(validate.errors)}`);
  if (definition.id !== entry.id || definition.category !== entry.category || definition.icon.id !== entry.icon) {
    throw new Error(`${entry.file}: catalog and definition disagree`);
  }
  definitions.push({
    ...definition,
    archetype: entry.archetype,
    status: editorReady.has(entry.id) ? 'ready' : 'planned',
  });
}
if (definitions.length !== 253) throw new Error(`Expected 253 definitions; found ${definitions.length}`);

const iconNames = new Set([...iconExports].map((name) => `solar:${name}`));
const iconFallbacks = {
  'solar:layers-minimalistic-linear': 'solar:layers-linear',
  'solar:quote-up-linear': 'solar:chat-round-quote-linear',
  'solar:highlighter-linear': 'solar:text-selection-linear',
  'solar:rotation-linear': 'solar:refresh-linear',
  'solar:hand-linear': 'solar:hand-shake-linear',
};
const iconMismatches = definitions.flatMap((definition) => {
  const id = definition.icon.id;
  const name = id.slice('solar:'.length);
  if (iconNames.has(id)) return [];
  const replacement =
    iconFallbacks[id] ??
    (iconNames.has(`solar:${name.replace(/-line$/, '-linear')}`)
      ? `solar:${name.replace(/-line$/, '-linear')}`
      : 'solar:widget-linear');
  if (!iconNames.has(replacement)) throw new Error(`Missing deterministic fallback icon: ${replacement}`);
  definition.paletteIcon = replacement;
  return [{ elementId: definition.id, requested: id, resolved: replacement }];
});

const byCategory = {};
const palette = definitions.map(({ id, title, category, icon, paletteIcon, subscription, status, description }) => {
  (byCategory[category] ??= []).push(id);
  return {
    id: `blixis/${id}`,
    definitionId: id,
    title,
    category,
    icon: paletteIcon ?? icon.id,
    tier: subscription.minimumTier,
    status,
    keywords: [id, title, category, description].join(' ').toLowerCase(),
  };
});
const union = (values) => values.map((value) => JSON.stringify(value)).join(' | ') || 'never';
const stripNonRuntimeMetadata = (value) => {
  if (Array.isArray(value)) return value.map(stripNonRuntimeMetadata);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.toLowerCase() !== 'gsap')
      .map(([key, child]) => [key, stripNonRuntimeMetadata(child)]),
  );
};
const types = `// Generated by pnpm sync:elements. Do not edit.\nexport type GeneratedElementId = ${union(definitions.map((item) => item.id))};\nexport type GeneratedElementType = \`blixis/\${GeneratedElementId}\`;\nexport type GeneratedElementStatus = 'ready' | 'planned';\nexport interface GeneratedElementDefinition { id: GeneratedElementId; namespace: 'blixis'; definitionVersion: string; status: GeneratedElementStatus; [key: string]: unknown }\nexport const GENERATED_ELEMENT_DEFINITIONS = ${JSON.stringify(stripNonRuntimeMetadata(definitions))} as const satisfies readonly GeneratedElementDefinition[];\nexport const GENERATED_ELEMENT_PALETTE = ${JSON.stringify(palette)} as const;\n`;

const generated = new Map([
  ['manifest', `${JSON.stringify({ schemaVersion: '2.0.0', definitions }, null, 2)}\n`],
  [
    'types',
    await format(types, {
      ...(await resolveConfig(path.join(root, 'packages/element-registry/src/generated-element-types.ts'))),
      parser: 'typescript',
    }),
  ],
  [
    'palette',
    `${JSON.stringify({ schemaVersion: '2.0.0', categories: Object.keys(byCategory).sort(), elements: palette }, null, 2)}\n`,
  ],
  [
    'icons',
    `${JSON.stringify({ package: '@iconify-icons/solar', version: packageData.version, attribution: 'Solar Icons by 480 Design, CC BY 4.0', mismatches: iconMismatches }, null, 2)}\n`,
  ],
]);
for (const [relative, kind] of outputs) {
  const target = path.join(root, relative);
  const text = generated.get(kind);
  if (process.argv.includes('--check')) {
    let actual = '';
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      // A missing generated artifact is stale.
    }
    if (actual !== text) throw new Error(`${relative} is stale; run pnpm sync:elements`);
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}
console.log(
  `${process.argv.includes('--check') ? 'verified' : 'generated'} ${definitions.length} definitions; ${iconMismatches.length} icon mismatches`,
);
