import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu, PortalContainerProvider, type MenuItem } from '../index';

const choices = [
  { label: 'Alpha', onSelect: vi.fn() },
  { label: 'Disabled', disabled: true },
  { label: 'Beta', onSelect: vi.fn() },
  { label: 'Gamma', onSelect: vi.fn() },
];
function renderMenu(items: readonly MenuItem[] = choices, container: HTMLElement | null = null) {
  return render(
    <PortalContainerProvider container={container}>
      <Menu label="Actions" items={items}>
        <span>More</span>
      </Menu>
    </PortalContainerProvider>,
  );
}

describe('Menu keyboard and focus behavior', () => {
  it('shows a Solar check on checked rows without confusing it with keyboard focus', async () => {
    const user = userEvent.setup();
    renderMenu([
      { label: 'Checked', checked: true },
      { label: 'Unchecked', checked: false },
    ]);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const checked = screen.getByRole('menuitemcheckbox', { name: 'Checked' });
    expect(checked.querySelector('svg')).toBeTruthy();
    expect(checked.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Unchecked' }).querySelector('svg')).toBeNull();
  });
  it('opens with Enter', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeTruthy();
  });
  it('opens with Space', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('menu')).toBeTruthy();
  });
  it('opens with ArrowDown and focuses first item', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Alpha');
  });
  it('closes with Escape and restores trigger focus', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Actions' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(trigger);
  });
  it('moves down and wraps over enabled items', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Beta');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Gamma');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Alpha');
  });
  it('moves up and wraps over enabled items', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('role')).toMatch(/^menuitem/);
    });
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Gamma');
  });
  it('skips disabled items when moving down', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Beta');
  });
  it('skips disabled items when moving up', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toContain('Beta');
  });
  it('supports ArrowRight as forward navigation in LTR', async () => {
    const user = userEvent.setup();
    renderMenu();
    document.documentElement.dir = 'ltr';
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toContain('Beta');
  });
  it('supports ArrowLeft as backward navigation in LTR', async () => {
    const user = userEvent.setup();
    renderMenu();
    document.documentElement.dir = 'ltr';
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement?.textContent).toContain('Gamma');
  });
  it('mirrors ArrowRight navigation in RTL', async () => {
    const user = userEvent.setup();
    renderMenu();
    document.documentElement.dir = 'rtl';
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toContain('Gamma');
    document.documentElement.dir = '';
  });
  it('mirrors ArrowLeft navigation in RTL', async () => {
    const user = userEvent.setup();
    renderMenu();
    document.documentElement.dir = 'rtl';
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement?.textContent).toContain('Beta');
    document.documentElement.dir = '';
  });
  it('supports Home', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.keyboard('{End}{Home}');
    expect(document.activeElement?.textContent).toContain('Alpha');
  });
  it('supports End', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.keyboard('{End}');
    expect(document.activeElement?.textContent).toContain('Gamma');
  });
  it('supports typeahead by initial', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'g' });
    expect(document.activeElement?.textContent).toContain('Gamma');
  });
  it('supports repeated typeahead text', async () => {
    const user = userEvent.setup();
    renderMenu([{ label: 'Alpha' }, { label: 'Alpine' }]);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'a' });
    expect(document.activeElement?.textContent).toContain('Alpha');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'a' });
    expect(document.activeElement?.textContent).toContain('Alpine');
  });
  it('activates an item by click', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    renderMenu([{ label: 'Run action', onSelect: action }]);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Run action' }));
    expect(action).toHaveBeenCalledOnce();
  });
  it('closes and restores focus after activation', async () => {
    const user = userEvent.setup();
    renderMenu([{ label: 'Run action' }]);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem'));
    expect(screen.queryByRole('menu')).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(trigger);
  });
  it('keeps disabled entries out of keyboard focus', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).not.toContain('Disabled');
  });
  it('announces disabled entries with aria-disabled', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Disabled' }).getAttribute('aria-disabled')).toBe('true');
  });
  it('closes on outside pointer down', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Menu label="Actions" items={choices}>
          More
        </Menu>
        <button>Outside</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('portals into the provided editor root', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const user = userEvent.setup();
    renderMenu(choices, root);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(within(root).getByRole('menu')).toBeTruthy();
    root.remove();
  });
  it('uses the document body without a provider', async () => {
    const user = userEvent.setup();
    render(
      <Menu label="Actions" items={choices}>
        More
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(within(document.body).getByRole('menu')).toBeTruthy();
  });
  it('maintains checked state for menu options', async () => {
    const user = userEvent.setup();
    renderMenu([{ label: 'Selected', checked: true }]);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Selected' }).getAttribute('aria-checked')).toBe('true');
  });
});
