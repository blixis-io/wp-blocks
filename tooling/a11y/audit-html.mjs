// Small tolerant tokenizer for structural checks; browser behavior remains for later tests.
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

function tokenize(html) {
  const nodes = [];
  const stack = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== '<') {
      const end = html.indexOf('<', i);
      const value = html.slice(i, end < 0 ? html.length : end);
      for (const node of stack) node.text += value;
      i += value.length;
      continue;
    }
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      const end = html.indexOf('>', i + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    let j = i + 1;
    const closing = html[j] === '/';
    if (closing) j++;
    const start = j;
    while (j < html.length && /[a-zA-Z0-9:-]/.test(html[j])) j++;
    if (j === start) {
      i++;
      continue;
    }
    const tag = html.slice(start, j).toLowerCase();
    const attrs = {};
    let selfClosing = false;
    while (j < html.length) {
      while (j < html.length && /\s/.test(html[j])) j++;
      if (html[j] === '>') {
        j++;
        break;
      }
      if (html[j] === '/' && html[j + 1] === '>') {
        selfClosing = true;
        j += 2;
        break;
      }
      const aStart = j;
      while (j < html.length && !/[\s=/>]/.test(html[j])) j++;
      if (j === aStart) {
        j++;
        continue;
      }
      const name = html.slice(aStart, j).toLowerCase();
      while (j < html.length && /\s/.test(html[j])) j++;
      let value = '';
      if (html[j] === '=') {
        j++;
        while (j < html.length && /\s/.test(html[j])) j++;
        const quote = html[j] === '"' || html[j] === "'" ? html[j++] : null;
        const vStart = j;
        if (quote) {
          while (j < html.length && html[j] !== quote) j++;
        } else {
          while (j < html.length && !/[\s>]/.test(html[j])) j++;
        }
        value = html.slice(vStart, j);
        if (quote && html[j] === quote) j++;
      }
      attrs[name] = value;
    }
    i = j;
    if (closing) {
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const node = { tag, attrs, text: '', parent: stack.at(-1) ?? null };
    nodes.push(node);
    if (!selfClosing && !voidTags.has(tag)) stack.push(node);
    if (tag === 'script' || tag === 'style') {
      const end = html.toLowerCase().indexOf('</' + tag, i);
      if (end >= 0) {
        i = html.indexOf('>', end) + 1;
        stack.pop();
      }
    }
  }
  return nodes;
}

function ancestor(node, tag) {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.tag === tag) return true;
  return false;
}

export function auditHtml(html) {
  const nodes = tokenize(html);
  const findings = [];
  const add = (rule, message) => findings.push({ rule, message });
  const byTag = (tag) => nodes.filter((node) => node.tag === tag);
  const root = byTag('html')[0];
  if (!root || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(root.attrs.lang ?? ''))
    add('html-lang', 'html needs a valid-looking lang attribute');
  const body = byTag('body')[0];
  if (body?.attrs.class?.split(/\s+/).includes('rtl') && root?.attrs.dir !== 'rtl')
    add('html-dir', 'RTL body needs html dir="rtl"');
  const titles = byTag('title');
  if (titles.length !== 1 || !titles[0].text.trim()) add('title', 'page needs one non-empty title');
  const viewport = byTag('meta').find((node) => node.attrs.name?.toLowerCase() === 'viewport');
  const viewportValue = viewport?.attrs.content?.toLowerCase() ?? '';
  if (
    !viewport ||
    /user-scalable\s*=\s*no/.test(viewportValue) ||
    /maximum-scale\s*=\s*(?:0|1)(?:\D|$)/.test(viewportValue)
  )
    add('viewport', 'viewport must permit at least 2x zoom');
  const headings = nodes.filter((node) => /^h[1-6]$/.test(node.tag));
  if (headings.filter((node) => node.tag === 'h1').length !== 1) add('h1', 'page needs exactly one h1');
  for (let k = 1; k < headings.length; k++)
    if (Number(headings[k].tag[1]) > Number(headings[k - 1].tag[1]) + 1)
      add('heading-order', headings[k - 1].tag + ' skips to ' + headings[k].tag);
  const ids = new Set();
  for (const node of nodes) {
    if (!('id' in node.attrs)) continue;
    if (ids.has(node.attrs.id)) add('duplicate-id', 'duplicate id: ' + node.attrs.id);
    ids.add(node.attrs.id);
  }
  const mains = byTag('main');
  if (mains.length !== 1) add('main', 'page needs exactly one main landmark');
  for (const tag of ['header', 'nav', 'footer'])
    if (!byTag(tag).length) add('landmark', 'page needs a ' + tag + ' landmark');
  const navs = byTag('nav');
  if (navs.length > 1)
    for (const nav of navs)
      if (!nav.attrs['aria-label']?.trim() && !nav.attrs['aria-labelledby']?.trim())
        add('nav-name', 'each nav needs an accessible name when multiple navs exist');
  const first = nodes.find(
    (node) =>
      !('disabled' in node.attrs) &&
      ((['a', 'button', 'input', 'select', 'textarea'].includes(node.tag) &&
        (node.tag !== 'a' || 'href' in node.attrs)) ||
        ('tabindex' in node.attrs && Number(node.attrs.tabindex) >= 0)),
  );
  if (
    !first ||
    first.tag !== 'a' ||
    !first.attrs.class?.split(/\s+/).includes('skip-link') ||
    !first.attrs.href?.startsWith('#') ||
    !ids.has(first.attrs.href.slice(1)) ||
    mains.length !== 1 ||
    mains[0].attrs.id !== first.attrs.href.slice(1)
  )
    add('skip-link', 'first focusable element must skip to the main landmark');
  for (const img of byTag('img')) if (!('alt' in img.attrs)) add('img-alt', 'img needs an alt attribute');
  const labels = new Set(
    byTag('label')
      .map((node) => node.attrs.for)
      .filter(Boolean),
  );
  for (const control of nodes.filter((node) => ['input', 'select', 'textarea'].includes(node.tag))) {
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(control.attrs.type?.toLowerCase())) continue;
    if (
      !control.attrs['aria-label']?.trim() &&
      !control.attrs['aria-labelledby']?.trim() &&
      !labels.has(control.attrs.id) &&
      !ancestor(control, 'label')
    )
      add('form-label', control.tag + ' needs a label');
  }
  for (const link of byTag('a')) {
    const namedImage = nodes.some((node) => node.parent === link && node.tag === 'img' && node.attrs.alt?.trim());
    if (!link.attrs['aria-label']?.trim() && !link.attrs['aria-labelledby']?.trim() && !link.text.trim() && !namedImage)
      add('link-name', 'link needs an accessible name');
  }
  return findings;
}
