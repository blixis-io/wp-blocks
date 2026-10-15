import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsOutCardinalIcon,
  CaretDownIcon,
  CheckIcon,
  EyeIcon,
  ImageIcon,
  KeyboardIcon,
  TranslateIcon,
  LockIcon,
  MonitorIcon,
  MoonIcon,
  MoonStarsIcon,
  SidebarSimpleIcon,
  SidebarIcon,
  ParagraphIcon,
  PlusIcon,
  RectangleIcon,
  SunIcon,
  SunDimIcon,
  DeviceTabletIcon,
  TextHIcon,
  TrashIcon,
  ArrowUUpLeftIcon,
  UploadSimpleIcon,
  ArrowClockwiseIcon,
  DeviceMobileIcon,
  FloppyDiskIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import type { ElementDefinition } from '@blixis/wp-element-registry';

/** Stable semantic icon names used by editor components. Keep imports named for bundler tree-shaking. */
export const ICONS = {
  back: ArrowLeftIcon,
  forward: ArrowRightIcon,
  caretRight: CaretDownIcon,
  move: ArrowsOutCardinalIcon,
  chevronDown: CaretDownIcon,
  check: CheckIcon,
  preview: EyeIcon,
  image: ImageIcon,
  shortcuts: KeyboardIcon,
  language: TranslateIcon,
  lock: LockIcon,
  desktop: MonitorIcon,
  dark: MoonIcon,
  appearance: SunDimIcon,
  panelLeft: SidebarSimpleIcon,
  panelRight: SidebarIcon,
  text: ParagraphIcon,
  add: PlusIcon,
  section: RectangleIcon,
  light: SunIcon,
  tablet: DeviceTabletIcon,
  heading: TextHIcon,
  delete: TrashIcon,
  undo: ArrowUUpLeftIcon,
  publish: UploadSimpleIcon,
  refresh: ArrowClockwiseIcon,
  mobile: DeviceMobileIcon,
  save: FloppyDiskIcon,
  close: XIcon,
  container: RectangleIcon,
  button: RectangleIcon,
  fallback: RectangleIcon,
  system: SunDimIcon,
  moonStars: MoonStarsIcon,
} as const satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

/** Core element types mapped to semantic icons. Keep in sync with createCoreRegistry(). */
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
