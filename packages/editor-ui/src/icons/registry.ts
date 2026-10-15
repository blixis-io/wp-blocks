import add from '@iconify-icons/solar/add-linear';
import altArrowDown from '@iconify-icons/solar/alt-arrow-down-linear';
import altArrowLeft from '@iconify-icons/solar/alt-arrow-left-linear';
import altArrowRight from '@iconify-icons/solar/alt-arrow-right-linear';
import box from '@iconify-icons/solar/box-linear';
import check from '@iconify-icons/solar/check-linear';
import close from '@iconify-icons/solar/close-linear';
import cursorSquare from '@iconify-icons/solar/cursor-square-linear';
import devices from '@iconify-icons/solar/devices-linear';
import diskette from '@iconify-icons/solar/diskette-linear';
import documentText from '@iconify-icons/solar/document-text-linear';
import eye from '@iconify-icons/solar/eye-linear';
import gallery from '@iconify-icons/solar/gallery-linear';
import layers from '@iconify-icons/solar/layers-linear';
import lock from '@iconify-icons/solar/lock-linear';
import magnifer from '@iconify-icons/solar/magnifer-linear';
import menuDots from '@iconify-icons/solar/menu-dots-linear';
import monitor from '@iconify-icons/solar/monitor-linear';
import moon from '@iconify-icons/solar/moon-linear';
import sun from '@iconify-icons/solar/sun-linear';
import text from '@iconify-icons/solar/text-linear';
import textField from '@iconify-icons/solar/text-field-linear';
import trash from '@iconify-icons/solar/trash-bin-trash-linear';
import translation from '@iconify-icons/solar/translation-linear';
import upload from '@iconify-icons/solar/upload-linear';
import widget from '@iconify-icons/solar/widget-3-linear';
import type { ElementDefinition } from '@blixis/wp-element-registry';

interface SolarIconData {
  width?: number;
  height?: number;
  body: string;
}

/** Individual Solar Linear assets: imports stay explicit so the build can tree-shake unused glyphs. */
export const ICONS = {
  back: altArrowLeft,
  forward: altArrowRight,
  caretRight: altArrowRight,
  move: cursorSquare,
  chevronDown: altArrowDown,
  check,
  preview: eye,
  image: gallery,
  search: magnifer,
  shortcuts: documentText,
  language: translation,
  lock,
  desktop: monitor,
  dark: moon,
  appearance: sun,
  panelLeft: layers,
  panelRight: layers,
  text,
  add,
  section: widget,
  light: sun,
  tablet: devices,
  heading: textField,
  delete: trash,
  undo: altArrowLeft,
  publish: upload,
  refresh: add,
  mobile: devices,
  save: diskette,
  close,
  container: box,
  button: cursorSquare,
  fallback: widget,
  system: sun,
  moonStars: moon,
  menuDots,
} as const satisfies Record<string, SolarIconData>;

export type IconName = keyof typeof ICONS;
export const ELEMENT_ICONS = {
  'blixis/section': 'section',
  'blixis/container': 'container',
  'blixis/heading': 'heading',
  'blixis/text': 'text',
  'blixis/image': 'image',
  'blixis/button': 'button',
} satisfies Record<ElementDefinition['type'], IconName>;
export function elementIconName(type: string): IconName {
  return Object.hasOwn(ELEMENT_ICONS, type) ? ELEMENT_ICONS[type as keyof typeof ELEMENT_ICONS] : 'fallback';
}
