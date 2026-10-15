import { describe, expect, it } from 'vitest';
import { applyCommand } from '@blixis/wp-core';
import { compile } from '@blixis/wp-style-engine';
import { makeDocument } from '../test/state-helpers';
import { styleSelector } from './style-mapping';

describe('inspector style command to compiled preview', () => {
  it('compiles a desktop logical spacing edit through core applyCommand', () => {
    const document = makeDocument();
    const command = {
      type: 'set-style-rule',
      id: 'el-heading-1',
      selector: styleSelector('base'),
      declarations: { 'margin-block-start': 'var(--blx-space-4)' },
    } as const;
    const applied = applyCommand(document, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const preview = compile({ document: applied.document });
    expect(preview.issues).toEqual([]);
    expect(preview.css).toContain('margin-block-start:var(--blx-space-4)');
  });

  it('compiles an override at the selected responsive breakpoint', () => {
    const applied = applyCommand(makeDocument(), {
      type: 'set-style-rule',
      id: 'el-heading-1',
      selector: styleSelector('mobile'),
      declarations: { 'margin-block-start': 'var(--blx-space-4)' },
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const preview = compile({ document: applied.document });
    expect(preview.issues).toEqual([]);
    expect(preview.css).toContain('@media');
    expect(preview.css).toContain('margin-block-start:var(--blx-space-4)');
  });
});
