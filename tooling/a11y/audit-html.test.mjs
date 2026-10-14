import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditHtml } from './audit-html.mjs';

const page = (body, root = 'lang="en-US"') =>
  `<!doctype html><html ${root}><head><title>Sample</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><a class="skip-link" href="#content">Skip to content</a><header><nav aria-label="Primary">Menu</nav></header><main id="content"><h1>Title</h1>${body}</main><footer>Footer</footer></body></html>`;

test('good markup, including quoted greater-than signs, passes', () => {
  assert.deepEqual(
    auditHtml(
      page(
        '<h2 data-note="a > b">Section</h2><img alt=""><label for="q">Search</label><input id="q"><a href="/more">More</a>',
      ),
    ),
    [],
  );
  assert.deepEqual(auditHtml(page('', 'lang="ar" dir="rtl"').replace('<body>', '<body class="rtl">')), []);
});

test('reports document, heading, and landmark defects', () => {
  const bad = page('<h3>Jump</h3><h1>Again</h1><nav>Extra</nav>', 'lang=""')
    .replace('<title>Sample</title>', '<title> </title>')
    .replace('initial-scale=1', 'maximum-scale=1, user-scalable=no')
    .replace('<footer>Footer</footer>', '');
  const rules = auditHtml(bad).map((finding) => finding.rule);
  for (const rule of ['html-lang', 'title', 'viewport', 'h1', 'heading-order', 'landmark', 'nav-name'])
    assert.ok(rules.includes(rule), rule);
});

test('reports skip link, images, labels, duplicate ids, links, and RTL direction', () => {
  const bad = page('<img src="x"><input id="q"><div id="q"></div><a href="/x"></a>', 'lang="ar"')
    .replace('<body>', '<body class="rtl">')
    .replace('class="skip-link" href="#content"', 'href="#missing"');
  const rules = auditHtml(bad).map((finding) => finding.rule);
  for (const rule of ['html-dir', 'skip-link', 'img-alt', 'form-label', 'duplicate-id', 'link-name'])
    assert.ok(rules.includes(rule), rule);
});
