import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const php = readFileSync(new URL('../wordpress/theme/src/SetupAdmin.php', import.meta.url), 'utf8');
const po = readFileSync(new URL('../wordpress/theme/languages/blixis-nl_NL.po', import.meta.url), 'utf8');
const msgids = [...po.matchAll(/^msgid "(.*)"$/gm)].map((match) => match[1]);
const translated = [...po.matchAll(/^msgstr "(.*)"$/gm)].map((match) => match[1]);

test('setup wizard visible strings have Dutch gettext entries', () => {
  const visible = [
    'Welcome to Blixis',
    'Choose a starter design and customize its style. You can always change this later.',
    'Welcome',
    'Theme',
    'Style',
    'Content',
    'Finish',
    'Choose a starter design',
    'Starter pages and template imports are not part of this setup yet. Choose later from WordPress Pages when you are ready.',
    'All Templates',
    'Business',
    'Blog',
    'Portfolio',
    'eCommerce',
    'Filter starter designs',
    'Starter designs',
    'A thoughtful design for your site',
    'Make it yours',
    'Finish setup',
    'Your choices',
    'Continue',
    'Skip Setup',
  ];
  for (const msgid of visible) {
    assert.ok(
      php.includes(`__( '${msgid}', 'blixis' )`) ||
        php.includes(`esc_html__( '${msgid}', 'blixis' )`) ||
        php.includes(`esc_attr__( '${msgid}', 'blixis' )`),
      `English gettext source exists: ${msgid}`,
    );
    assert.ok(msgids.includes(msgid), `Dutch msgid exists: ${msgid}`);
    assert.ok(translated[msgids.indexOf(msgid)], `Dutch translation is nonempty: ${msgid}`);
  }
});
