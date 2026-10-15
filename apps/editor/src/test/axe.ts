import axe from 'axe-core';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Runs axe-core against the WCAG A/AA rules and returns a readable list of violations (empty when clean). */
export async function axeViolations(context: Element | Document = document): Promise<string[]> {
  const result = await axe.run(context, {
    runOnly: { type: 'tag', values: WCAG_TAGS },
    // jsdom has no layout engine, so colour contrast is verified separately from the design tokens.
    // The host WordPress admin page owns <title> and <html lang>.
    rules: {
      'color-contrast': { enabled: false },
      'document-title': { enabled: false },
      'html-has-lang': { enabled: false },
    },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}
