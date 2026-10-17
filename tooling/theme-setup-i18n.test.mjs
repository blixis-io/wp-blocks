import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const php = readFileSync(new URL('../wordpress/theme/src/SetupAdmin.php', import.meta.url), 'utf8');
const presets = ['ocean', 'forest', 'sunset', 'minimal'].map((id) =>
  JSON.parse(readFileSync(new URL(`../wordpress/theme/design/presets/${id}.json`, import.meta.url), 'utf8')),
);
const po = readFileSync(new URL('../wordpress/theme/languages/blixis-nl_NL.po', import.meta.url), 'utf8');
const msgids = [...po.matchAll(/^msgid "(.*)"$/gm)].map((match) => match[1]);
const translated = [...po.matchAll(/^msgstr "(.*)"$/gm)].map((match) => match[1]);

test('setup wizard visible strings have Dutch gettext entries', () => {
  const visible = [
    'Welcome to',
    'Let’s get your website ready in a few simple steps. Choose a starter design, customize the style, and import content. You can always change these settings later.',
    'Setup Wizard',
    'View Site',
    'These professionally designed templates give you a head start. You can customize everything after setup.',
    'Choose a color palette for your site. You can fine-tune these later in Global Styles.',
    'Pick a font pairing for your website.',
    'Template categories',
    'All',
    'View All Templates',
    'Real estate',
    'Agency',
    'Corporate',
    'Ecommerce',
    'Template palette',
    'Template fonts',
    'Clean & modern (Recommended)',
    'System font pairing',
    'Installed',
    'Not installed',
    'Install font',
    'Template fonts were installed. Continue to apply them.',
    'Template fonts could not be installed. The system font pairing will be used.',
    'Color scheme',
    'Choose a palette for your website. Fine-tune it later in Global Styles.',
    'Font selection',
    'Choose a system font pairing for your website.',
    'You can access the setup wizard anytime from the Blixis menu.',
    'Set up the Blixis theme when you are ready.',
    'Start setup',
    'Dismiss',
    'Restore previous version',
    'Current design: %1$s, version %2$s, saved %3$s',
    'Begin with a neutral design and shape it yourself.',
    'Start from scratch',
    'Welcome',
    'Theme',
    'Style',
    'Content',
    'Finish',
    'Choose a starter design',
    'Starter designs',
    'Make it yours',
    'Select your theme foundation',
    'Style your website',
    'Add Your Content',
    'Setup Complete!',
    'Import demo content to get a head start. You can choose what to import and adjust these settings later.',
    'Content import is not available for this starter design yet.',
    'This template does not include importable content.',
    'Import is not available for this template yet.',
    'Choose your default color mode. Visitors can still switch modes later.',
    'Your website is ready to launch. The selected design and style settings will be applied to your site.',
    'Header style',
    'Modern Header',
    'Minimal Header',
    'Centered Header',
    'Footer style',
    'Modern Footer',
    'Minimal Footer',
    'Centered Footer',
    'Container width',
    'Boxed',
    'Wide',
    'Full Width',
    'Starter layout',
    'Business',
    'Portfolio',
    'Online Store',
    'Coming soon: this template setting does not have an apply backend yet.',
    'Your choices',
    'Continue',
    'Skip Setup',
    'Auto',
    'Light',
    'Dark',
  ];
  const choiceCopy = [
    'Ocean',
    'Deep blues and cool neutrals.',
    'Forest',
    'Leaf greens and warm neutrals.',
    'Sunset',
    'Warm terracotta and amber.',
    'Minimal',
    'High-contrast monochrome essentials.',
    'Primary',
    'Nature',
    'Secondary',
    'Neutral',
    'Modern',
    'Fresh',
    'Vibrant',
    'System Sans',
    'Editorial',
    'Technical',
    'Clean & modern',
    'Classic & readable',
    'Compact & precise',
  ];
  for (const preset of presets) {
    assert.ok(preset.label && preset.tagline, `preset display copy exists: ${preset.id}`);
    choiceCopy.push(preset.label, preset.tagline);
  }
  for (const msgid of [...visible, ...choiceCopy]) {
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
