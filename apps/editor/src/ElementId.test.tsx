// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@blixis/wp-editor-ui';
import { describe, expect, it } from 'vitest';
import { ElementId } from './ElementId';

describe('ElementId', () => {
  it('renders the full stable id with the shared secondary-text class', () => {
    render(
      <TooltipProvider>
        <ElementId id="el-heading-a-very-long-stable-id-123456" />
      </TooltipProvider>,
    );
    const id = screen.getByLabelText('el-heading-a-very-long-stable-id-123456');
    expect(id.textContent).toBe('el-heading-a-very-long-stable-id-123456');
    expect(id.className).toBe('blx-outline-id');
    expect(id.hasAttribute('title')).toBe(false);
  });
  it('exposes the full stable id in the themed hover tooltip', async () => {
    const { container } = render(
      <TooltipProvider>
        <ElementId id="el-heading-a-very-long-stable-id-123456" />
      </TooltipProvider>,
    );
    const label = container.querySelector('.blx-outline-id');
    expect(label?.getAttribute('aria-label')).toBe('el-heading-a-very-long-stable-id-123456');
    if (!label) throw new Error('ElementId label was not rendered');
    await userEvent.setup().hover(label);
    expect((await screen.findByRole('tooltip', {}, { timeout: 2000 })).textContent).toBe(
      'el-heading-a-very-long-stable-id-123456',
    );
  });
});
