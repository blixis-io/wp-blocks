/**
 * The allow-list: every CSS property a style rule may set, with the grammar its value must match. Plain JSON-able data (it is
 * exported to `manifest/css-properties.json` for the PHP twin). Anything not listed is rejected, so adding a property is a
 * deliberate, reviewed change.
 */
export type Kind =
  | { k: 'keywords'; values: string[] }
  | { k: 'keyword-list'; values: string[]; max: number; exclusive?: string }
  | { k: 'length'; neg?: boolean; pct?: boolean; extra?: string[] }
  | { k: 'box'; neg?: boolean; pct?: boolean; extra?: string[] }
  | { k: 'color' }
  | { k: 'color-list'; max: number }
  | { k: 'number'; min: number; max: number; pct?: boolean }
  | { k: 'integer'; min: number; max: number; extra?: string[] }
  | { k: 'font-family' }
  | { k: 'font-weight' }
  | { k: 'line-height' }
  | { k: 'shadow' }
  | { k: 'border' }
  | { k: 'radius'; max: number }
  | { k: 'background-size' }
  | { k: 'position' }
  | { k: 'gradient' }
  | { k: 'tracks' }
  | { k: 'transform' }
  | { k: 'aspect-ratio' }
  | { k: 'flex' }
  | { k: 'grid-line' }
  | { k: 'times'; neg?: boolean }
  | { k: 'easing'; max: number }
  | { k: 'ident-list'; values: string[]; max: number };

/** Keywords every property accepts as its only value. */
export const WIDE_KEYWORDS = ['inherit', 'initial', 'revert', 'unset'] as const;

export const LENGTH_UNITS = [
  'px',
  'em',
  'rem',
  'ch',
  'ex',
  'vw',
  'vh',
  'vmin',
  'vmax',
  'dvw',
  'dvh',
  'svw',
  'svh',
  'lvw',
  'lvh',
] as const;
export const ANGLE_UNITS = ['deg', 'rad', 'turn', 'grad'] as const;
export const TIME_UNITS = ['s', 'ms'] as const;
export const MATH_FUNCTIONS = ['calc', 'min', 'max', 'clamp'] as const;
export const COLOR_FUNCTIONS = ['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab', 'lab', 'lch', 'color-mix'] as const;
export const GRADIENT_FUNCTIONS = [
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
] as const;
export const TRACK_FUNCTIONS = ['repeat', 'minmax', 'fit-content'] as const;
export const EASING_FUNCTIONS = ['cubic-bezier', 'steps'] as const;
export const EASING_KEYWORDS = [
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
] as const;
export const TRANSFORM_FUNCTIONS = [
  'translate',
  'translatex',
  'translatey',
  'scale',
  'scalex',
  'scaley',
  'rotate',
  'skew',
  'skewx',
  'skewy',
] as const;

export const NAMED_COLORS =
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor'.split(
    ' ',
  );

/** Identifiers allowed inside colour functions, gradients and grid tracks (never as free text). */
export const COLOR_ARG_IDENTS = [
  'none',
  'in',
  'srgb',
  'srgb-linear',
  'oklab',
  'oklch',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'xyz',
  'shorter',
  'longer',
  'increasing',
  'decreasing',
  'hue',
];
export const GRADIENT_ARG_IDENTS = [
  ...COLOR_ARG_IDENTS,
  'to',
  'left',
  'right',
  'top',
  'bottom',
  'center',
  'circle',
  'ellipse',
  'closest-side',
  'farthest-side',
  'closest-corner',
  'farthest-corner',
  'at',
  'from',
];
export const TRACK_ARG_IDENTS = ['auto', 'none', 'min-content', 'max-content', 'auto-fill', 'auto-fit'];

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

const kw = (...values: string[]): Kind => ({ k: 'keywords', values });
const size = (extra: string[]): Kind => ({ k: 'length', pct: true, extra });
const ALIGN = ['normal', 'stretch', 'start', 'end', 'flex-start', 'flex-end', 'center', 'baseline'];
const DISTRIBUTE = ['space-between', 'space-around', 'space-evenly'];
const BORDER_STYLES = ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'];
const OVERFLOW = kw('visible', 'hidden', 'clip', 'scroll', 'auto');

const entries: [string, Kind][] = [
  // Layout
  [
    'display',
    kw(
      'block',
      'inline',
      'inline-block',
      'flex',
      'inline-flex',
      'grid',
      'inline-grid',
      'flow-root',
      'contents',
      'none',
    ),
  ],
  ['position', kw('static', 'relative', 'absolute', 'fixed', 'sticky')],
  ...SIDES.map((s): [string, Kind] => [s, { k: 'length', neg: true, pct: true, extra: ['auto'] }]),
  ['z-index', { k: 'integer', min: -1000, max: 1000, extra: ['auto'] }],
  ['overflow', OVERFLOW],
  ['overflow-x', OVERFLOW],
  ['overflow-y', OVERFLOW],
  ['visibility', kw('visible', 'hidden', 'collapse')],
  ['box-sizing', kw('border-box', 'content-box')],
  ['aspect-ratio', { k: 'aspect-ratio' }],
  ['object-fit', kw('fill', 'contain', 'cover', 'none', 'scale-down')],
  ['object-position', { k: 'position' }],
  // Size
  ['width', size(['auto', 'min-content', 'max-content', 'fit-content'])],
  ['height', size(['auto', 'min-content', 'max-content', 'fit-content'])],
  ['min-width', size(['auto', 'min-content', 'max-content', 'fit-content'])],
  ['min-height', size(['auto', 'min-content', 'max-content', 'fit-content'])],
  ['max-width', size(['none', 'min-content', 'max-content', 'fit-content'])],
  ['max-height', size(['none', 'min-content', 'max-content', 'fit-content'])],
  // Spacing
  ['margin', { k: 'box', neg: true, pct: true, extra: ['auto'] }],
  ...SIDES.map((s): [string, Kind] => [`margin-${s}`, { k: 'length', neg: true, pct: true, extra: ['auto'] }]),
  ...(['block-start', 'inline-end', 'block-end', 'inline-start'] as const).map((s): [string, Kind] => [
    `margin-${s}`,
    { k: 'length', neg: true, pct: true, extra: ['auto'] },
  ]),
  ['padding', { k: 'box', pct: true }],
  ...SIDES.map((s): [string, Kind] => [`padding-${s}`, { k: 'length', pct: true }]),
  ...(['block-start', 'inline-end', 'block-end', 'inline-start'] as const).map((s): [string, Kind] => [
    `padding-${s}`,
    { k: 'length', pct: true },
  ]),
  ['gap', { k: 'box', pct: true }],
  ['row-gap', { k: 'length', pct: true, extra: ['normal'] }],
  ['column-gap', { k: 'length', pct: true, extra: ['normal'] }],
  // Flexbox and grid
  ['flex-direction', kw('row', 'row-reverse', 'column', 'column-reverse')],
  ['flex-wrap', kw('nowrap', 'wrap', 'wrap-reverse')],
  ['flex-grow', { k: 'number', min: 0, max: 1000 }],
  ['flex-shrink', { k: 'number', min: 0, max: 1000 }],
  ['flex-basis', { k: 'length', pct: true, extra: ['auto', 'content', 'min-content', 'max-content', 'fit-content'] }],
  ['flex', { k: 'flex' }],
  ['order', { k: 'integer', min: -1000, max: 1000 }],
  ['align-items', kw(...ALIGN)],
  ['align-content', kw(...ALIGN, ...DISTRIBUTE)],
  ['align-self', kw('auto', ...ALIGN)],
  ['justify-content', kw(...ALIGN, ...DISTRIBUTE, 'left', 'right')],
  ['justify-items', kw(...ALIGN, 'left', 'right')],
  ['justify-self', kw('auto', ...ALIGN, 'left', 'right')],
  ['grid-template-columns', { k: 'tracks' }],
  ['grid-template-rows', { k: 'tracks' }],
  ['grid-auto-columns', { k: 'tracks' }],
  ['grid-auto-rows', { k: 'tracks' }],
  ['grid-auto-flow', { k: 'keyword-list', values: ['row', 'column', 'dense'], max: 2 }],
  ['grid-column', { k: 'grid-line' }],
  ['grid-row', { k: 'grid-line' }],
  // Typography
  ['color', { k: 'color' }],
  ['font-family', { k: 'font-family' }],
  [
    'font-size',
    {
      k: 'length',
      pct: true,
      extra: [
        'xx-small',
        'x-small',
        'small',
        'medium',
        'large',
        'x-large',
        'xx-large',
        'xxx-large',
        'smaller',
        'larger',
      ],
    },
  ],
  ['font-weight', { k: 'font-weight' }],
  ['font-style', kw('normal', 'italic', 'oblique')],
  ['line-height', { k: 'line-height' }],
  ['letter-spacing', { k: 'length', neg: true, extra: ['normal'] }],
  ['word-spacing', { k: 'length', neg: true, extra: ['normal'] }],
  ['text-align', kw('left', 'right', 'center', 'justify', 'start', 'end')],
  ['text-transform', kw('none', 'uppercase', 'lowercase', 'capitalize')],
  [
    'text-decoration-line',
    { k: 'keyword-list', values: ['none', 'underline', 'overline', 'line-through'], max: 3, exclusive: 'none' },
  ],
  ['text-decoration-style', kw('solid', 'double', 'dotted', 'dashed', 'wavy')],
  ['text-decoration-color', { k: 'color' }],
  ['text-decoration-thickness', { k: 'length', pct: true, extra: ['auto', 'from-font'] }],
  ['text-underline-offset', { k: 'length', pct: true, neg: true, extra: ['auto'] }],
  ['text-indent', { k: 'length', pct: true, neg: true }],
  ['text-overflow', kw('clip', 'ellipsis')],
  ['white-space', kw('normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces')],
  ['word-break', kw('normal', 'break-all', 'keep-all', 'break-word')],
  ['overflow-wrap', kw('normal', 'break-word', 'anywhere')],
  ['hyphens', kw('none', 'manual', 'auto')],
  [
    'vertical-align',
    {
      k: 'length',
      pct: true,
      neg: true,
      extra: ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super'],
    },
  ],
  [
    'list-style-type',
    kw(
      'none',
      'disc',
      'circle',
      'square',
      'decimal',
      'decimal-leading-zero',
      'lower-alpha',
      'upper-alpha',
      'lower-roman',
      'upper-roman',
    ),
  ],
  // Background
  ['background-color', { k: 'color' }],
  ['background-image', { k: 'gradient' }],
  ['background-size', { k: 'background-size' }],
  ['background-position', { k: 'position' }],
  [
    'background-repeat',
    { k: 'keyword-list', values: ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'], max: 2 },
  ],
  ['background-clip', kw('border-box', 'padding-box', 'content-box', 'text')],
  // Border
  ['border', { k: 'border' }],
  ...SIDES.map((s): [string, Kind] => [`border-${s}`, { k: 'border' }]),
  ['border-width', { k: 'box', pct: false, extra: ['thin', 'medium', 'thick'] }],
  ['border-style', { k: 'keyword-list', values: BORDER_STYLES, max: 4 }],
  ['border-color', { k: 'color-list', max: 4 }],
  ...SIDES.flatMap((s): [string, Kind][] => [
    [`border-${s}-width`, { k: 'length', extra: ['thin', 'medium', 'thick'] }],
    [`border-${s}-style`, kw(...BORDER_STYLES)],
    [`border-${s}-color`, { k: 'color' }],
  ]),
  ['border-radius', { k: 'radius', max: 4 }],
  ...CORNERS.map((c): [string, Kind] => [`border-${c}-radius`, { k: 'radius', max: 2 }]),
  // Effects
  ['opacity', { k: 'number', min: 0, max: 1, pct: true }],
  ['box-shadow', { k: 'shadow' }],
  ['transform', { k: 'transform' }],
  ['transform-origin', { k: 'position' }],
  ['transition-duration', { k: 'times' }],
  ['transition-delay', { k: 'times', neg: true }],
  ['transition-timing-function', { k: 'easing', max: 4 }],
  [
    'transition-property',
    {
      k: 'ident-list',
      values: [
        'all',
        'none',
        'color',
        'background-color',
        'border-color',
        'opacity',
        'transform',
        'box-shadow',
        'width',
        'height',
        'margin',
        'padding',
        'top',
        'right',
        'bottom',
        'left',
        'gap',
        'border-radius',
        'font-size',
        'letter-spacing',
        'background-position',
        'visibility',
      ],
      max: 6,
    },
  ],
  [
    'cursor',
    kw(
      'auto',
      'default',
      'pointer',
      'text',
      'move',
      'not-allowed',
      'grab',
      'grabbing',
      'crosshair',
      'help',
      'wait',
      'zoom-in',
      'zoom-out',
    ),
  ],
  ['pointer-events', kw('auto', 'none')],
];

/** property name -> value grammar, in a stable order. */
export const PROPERTIES: ReadonlyMap<string, Kind> = new Map(entries);
