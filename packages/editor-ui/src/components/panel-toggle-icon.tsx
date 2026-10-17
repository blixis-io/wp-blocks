import { Icon, type IconProps } from './icon';

export type PanelLogicalSide = 'start' | 'end';
export type LayoutDirection = 'ltr' | 'rtl';

export function panelToggleIcon(side: PanelLogicalSide, open: boolean, dir: LayoutDirection) {
  const physicalRight = (side === 'start') === (dir === 'rtl');

  return {
    name: open ? 'sidebarClose' : 'sidebarOpen',
    // The installed Solar glyphs have their divider on the right. Flip for a left-side panel.
    flipX: !physicalRight,
  } as const;
}

export function PanelToggleIcon({
  side,
  open,
  dir,
  size = 18,
}: {
  side: PanelLogicalSide;
  open: boolean;
  dir: LayoutDirection;
  size?: IconProps['size'];
}) {
  const icon = panelToggleIcon(side, open, dir);
  return <Icon name={icon.name} size={size} flipX={icon.flipX} />;
}
