import add from '@iconify-icons/solar/add-linear';
import alignLeft from '@iconify-icons/solar/align-left-linear';
import alignCenter from '@iconify-icons/solar/align-horizontal-center-linear';
import alignRight from '@iconify-icons/solar/align-right-linear';
import alignJustify from '@iconify-icons/solar/align-horizontal-spacing-linear';
import altArrowDown from '@iconify-icons/solar/alt-arrow-down-linear';
import altArrowUp from '@iconify-icons/solar/alt-arrow-up-linear';
import altArrowLeft from '@iconify-icons/solar/alt-arrow-left-linear';
import altArrowRight from '@iconify-icons/solar/alt-arrow-right-linear';
import box from '@iconify-icons/solar/box-linear';
import check from '@iconify-icons/solar/check-linear';
import close from '@iconify-icons/solar/close-linear';
import copy from '@iconify-icons/solar/copy-linear';
import cursorSquare from '@iconify-icons/solar/cursor-square-linear';
import diskette from '@iconify-icons/solar/diskette-linear';
import eye from '@iconify-icons/solar/eye-linear';
import gallery from '@iconify-icons/solar/gallery-linear';
import global from '@iconify-icons/solar/global-linear';
import home from '@iconify-icons/solar/home-linear';
import link from '@iconify-icons/solar/link-linear';
import infoCircle from '@iconify-icons/solar/info-circle-linear';
import keyboard from '@iconify-icons/solar/keyboard-linear';
import lock from '@iconify-icons/solar/lock-linear';
import magnifier from '@iconify-icons/solar/magnifer-linear';
import menuDots from '@iconify-icons/solar/menu-dots-linear';
import monitor from '@iconify-icons/solar/monitor-linear';
import moon from '@iconify-icons/solar/moon-linear';
import moonStars from '@iconify-icons/solar/moon-stars-linear';
import panelLeft from '@iconify-icons/solar/panel-left-linear';
import panelRight from '@iconify-icons/solar/panel-right-linear';
import refresh from '@iconify-icons/solar/refresh-linear';
import smartphone from '@iconify-icons/solar/smartphone-linear';
import sun from '@iconify-icons/solar/sun-linear';
import tablet from '@iconify-icons/solar/tablet-linear';
import text from '@iconify-icons/solar/text-linear';
import textField from '@iconify-icons/solar/text-field-linear';
import trash from '@iconify-icons/solar/trash-bin-trash-linear';
import undoLeft from '@iconify-icons/solar/undo-left-linear';
import undoRight from '@iconify-icons/solar/undo-right-linear';
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
  chevronRight: altArrowRight,
  move: cursorSquare,
  chevronDown: altArrowDown,
  chevronUp: altArrowUp,
  link,
  alignLeft,
  alignCenter,
  alignRight,
  alignJustify,
  check,
  checkLinear: check,
  preview: eye,
  image: gallery,
  home,
  search: magnifier,
  shortcuts: keyboard,
  language: global,
  lock,
  desktop: monitor,
  dark: moon,
  appearance: sun,
  panelLeft,
  panelRight,
  text,
  add,
  copy,
  info: infoCircle,
  section: widget,
  light: sun,
  tablet,
  heading: textField,
  delete: trash,
  undo: undoLeft,
  redo: undoRight,
  publish: upload,
  refresh,
  mobile: smartphone,
  save: diskette,
  close,
  container: box,
  pages: box,
  documents: box,
  more: menuDots,
  button: cursorSquare,
  fallback: widget,
  system: moonStars,
  moonStars,
  menuDots,
} as const satisfies Record<string, SolarIconData>;

export type IconName = keyof typeof ICONS;
export const TEXT_ALIGN_ICONS = {
  left: 'alignLeft',
  center: 'alignCenter',
  right: 'alignRight',
  justify: 'alignJustify',
} as const satisfies Record<'left' | 'center' | 'right' | 'justify', IconName>;
export const DIRECTIONAL_ICONS = new Set<IconName>([
  'back',
  'forward',
  'caretRight',
  'chevronRight',
  'chevronDown',
  'chevronUp',
  'alignLeft',
  'alignRight',
  'panelLeft',
  'panelRight',
  'undo',
  'redo',
]);

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
