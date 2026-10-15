import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../test/axe';
import { cn } from '../lib/cn';
import { PortalContainerProvider } from '../lib/portal';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Kbd,
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  VisuallyHidden,
  Icon,
  type IconProps,
  ELEMENT_ICONS,
  elementIconName,
} from '../index';
import { CORE_ELEMENTS } from '@blixis/wp-element-registry';

describe('Icon', () => {
  it('is decorative by default and exposes a meaningful label when provided', () => {
    const { rerender, container } = render(<Icon name="preview" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('svg')?.hasAttribute('aria-label')).toBe(false);
    rerender(<Icon name="preview" label="Preview page" />);
    expect(screen.getByRole('img', { name: 'Preview page' }).getAttribute('aria-label')).toBe('Preview page');
  });

  it('adds an RTL mirror utility only for directional icons when requested', () => {
    const { container, rerender } = render(<Icon name="back" mirrorInRtl />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('rtl:-scale-x-100');
    rerender(<Icon name="back" />);
    expect(container.querySelector('svg')?.getAttribute('class') ?? '').not.toContain('rtl:-scale-x-100');
  });

  it('maps every registered core element and falls back for unknown types', () => {
    expect(Object.keys(ELEMENT_ICONS).sort()).toEqual(CORE_ELEMENTS.map((element) => element.type).sort());
    for (const element of CORE_ELEMENTS) expect(elementIconName(element.type)).not.toBe('fallback');
    expect(elementIconName('third-party/unknown')).toBe('fallback');
    const validName: IconProps['name'] = 'fallback';
    expect(validName).toBe('fallback');
    // @ts-expect-error unknown semantic icon names are rejected at compile time
    const invalidName: IconProps['name'] = 'not-an-icon';
    expect(invalidName).toBe('not-an-icon');
  });
});

describe('cn', () => {
  it('merges conflicting utilities and drops falsy values', () => {
    expect(cn('px-2 px-4', false, undefined, 'text-sm')).toBe('px-4 text-sm');
    expect(cn('a', { b: true, c: false })).toBe('a b');
  });
});

describe('Button', () => {
  it('defaults to type=button and applies variants and sizes', () => {
    render(
      <Button variant="destructive" size="touch">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveProperty('type', 'button');
    expect(button.className).toContain('bg-ed-destructive');
    expect(button.className).toContain('h-11');
  });

  it('keeps a 32px minimum and offers every variant', () => {
    for (const variant of ['default', 'secondary', 'ghost', 'outline', 'destructive'] as const) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button').className).toContain('h-[var(--ed-control-height)]');
      unmount();
    }
    render(<Button size="icon" aria-label="Icon" />);
    expect(screen.getByRole('button', { name: 'Icon' }).className).toContain('size-[var(--ed-control-height)]');
  });

  it('supports asChild without adding a type attribute to the child', () => {
    render(
      <Button asChild>
        <a href="/x">Link</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Link' });
    expect(link.hasAttribute('type')).toBe(false);
    expect(link.className).toContain('inline-flex');
  });

  it('does not fire clicks while natively disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Separator, VisuallyHidden, Kbd', () => {
  it('Separator is decorative by default and a real separator on request', () => {
    const { container, rerender } = render(<Separator />);
    expect(container.querySelector('[role="separator"]')).toBeNull();
    rerender(<Separator decorative={false} orientation="vertical" />);
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('VisuallyHidden keeps text in the accessibility tree', () => {
    render(<VisuallyHidden>Hidden label</VisuallyHidden>);
    expect(screen.getByText('Hidden label').className).toContain('sr-only');
  });

  it('Kbd renders a kbd element', () => {
    render(<Kbd>Ctrl</Kbd>);
    expect(screen.getByText('Ctrl').tagName).toBe('KBD');
  });
});

describe('ScrollArea', () => {
  it('is a named, focusable region', async () => {
    render(<ScrollArea label="Structure list">content</ScrollArea>);
    const region = screen.getByRole('region', { name: 'Structure list' });
    expect(region.tabIndex).toBe(0);
    expect(await axeViolations(region.parentElement ?? document)).toEqual([]);
  });
});

describe('Toolbar', () => {
  function Example() {
    const [value, setValue] = useState('desktop');
    return (
      <Toolbar aria-label="Main">
        <ToolbarButton>First</ToolbarButton>
        <ToolbarSeparator />
        <ToolbarToggleGroup
          type="single"
          value={value}
          onValueChange={(v) => {
            if (v) setValue(v);
          }}
          aria-label="Viewport"
        >
          <ToolbarToggleItem value="desktop">Desktop</ToolbarToggleItem>
          <ToolbarToggleItem value="mobile">Mobile</ToolbarToggleItem>
        </ToolbarToggleGroup>
        <ToolbarButton disabled>Disabled</ToolbarButton>
        <ToolbarLink href="/out">Link</ToolbarLink>
      </Toolbar>
    );
  }

  it('exposes one tab stop and moves with arrows, Home and End', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <Example />
      </>,
    );
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Desktop' }));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Link' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Link' }));
  });

  it('keeps aria-disabled buttons focusable and inert', async () => {
    const onClick = vi.fn();
    render(
      <Toolbar aria-label="T">
        <ToolbarButton disabled onClick={onClick}>
          Save
        </ToolbarButton>
      </Toolbar>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('toggle group is a single-choice radio group', async () => {
    render(<Example />);
    expect(screen.getByRole('radio', { name: 'Desktop' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('radio', { name: 'Mobile' }));
    expect(screen.getByRole('radio', { name: 'Mobile' }).getAttribute('aria-checked')).toBe('true');
    expect(await axeViolations()).toEqual([]);
  });
});

describe('Tooltip', () => {
  it('shows on keyboard focus, is described by the trigger and closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Undo</Button>
          </TooltipTrigger>
          <TooltipContent>Undo the last change</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Undo the last change');
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-describedby')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  it('portals into the provided container', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    render(
      <PortalContainerProvider container={host}>
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger asChild>
              <Button>T</Button>
            </TooltipTrigger>
            <TooltipContent>Hello</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PortalContainerProvider>,
    );
    await screen.findAllByText('Hello');
    expect(host.textContent).toContain('Hello');
    host.remove();
  });
});

describe('Dialog', () => {
  function Example() {
    return (
      <>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent title="Shortcuts" description="Planned keyboard shortcuts" closeLabel="Close dialog">
            <button type="button">Inside</button>
          </DialogContent>
        </Dialog>
        <button type="button">Outside</button>
      </>
    );
  }

  it('has a name and description, traps focus, closes on Escape and returns focus', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Shortcuts' });
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Planned keyboard shortcuts',
    );
    const focusable = [
      screen.getByRole('button', { name: 'Inside' }),
      screen.getByRole('button', { name: 'Close dialog' }),
    ];
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(focusable.length).toBe(2);
    expect(await axeViolations(dialog)).toEqual([]);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with the labelled close button', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('button', { name: 'Close dialog' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('Tabs', () => {
  it('implements the tabs pattern with arrow key navigation', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="content">
        <TabsList aria-label="Inspector sections">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>
        <TabsContent value="content">Content panel</TabsContent>
        <TabsContent value="style">Style panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Content' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain('Content panel');
    screen.getByRole('tab', { name: 'Content' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('Style panel');
    expect(await axeViolations()).toEqual([]);
  });
});
