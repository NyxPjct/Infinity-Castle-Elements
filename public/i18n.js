/* Offline localization for DOM text, accessibility labels, and Canvas 2D text.
 * Portuguese source strings are retained so switching languages never rewrites
 * save data or translates a previously translated sentence a second time.
 */
(function (root) {
  'use strict';
  const catalogs = root.ICE_TRANSLATIONS || { 'pt-BR': {} };
  const locales = Object.keys(catalogs);
  let language = 'pt-BR';
  let patterns = [], fragments = null, uppercase = new Map();
  const cache = new Map(), textSources = new WeakMap(), attributeSources = new WeakMap();
  const attributes = ['title', 'aria-label', 'alt', 'placeholder'];
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const ignored = element => element?.closest?.('script, style, textarea, [data-i18n-ignore], #settingLanguage');

  function compile() {
    cache.clear(); uppercase = new Map();
    const sources = Object.keys(catalogs[language] || {});
    for (const source of sources) uppercase.set(source.toLocaleUpperCase('pt-BR'), source);
    patterns = sources.filter(source => /\{\d+\}/.test(source)).map(source => {
      const slots = [], parts = source.split(/(\{\d+\})/);
      const regex = parts.map(part => {
        const slot = part.match(/^\{(\d+)\}$/);
        if (!slot) return escapeRegex(part);
        slots.push(Number(slot[1])); return '(.*?)';
      }).join('');
      return { source, slots, regex: new RegExp('^' + regex + '$', 'u') };
    }).sort((a, b) => b.source.replace(/\{\d+\}/g, '').length - a.source.replace(/\{\d+\}/g, '').length);
    // Longest phrases take precedence; Unicode boundaries prevent "Ar" from
    // matching inside unrelated words. Dynamic patterns are matched above.
    const words = sources.filter(source => !/\{\d+\}/.test(source) && /\p{L}/u.test(source))
      .sort((a, b) => b.length - a.length);
    fragments = words.length ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + words.map(escapeRegex).join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
  }

  function translate(value, depth = 0) {
    const raw = String(value ?? '');
    if (language === 'pt-BR' || !raw || depth > 4) return raw;
    if (cache.has(raw)) return cache.get(raw);
    const source = normalize(raw), catalog = catalogs[language];
    let translated = catalog[source];
    if (translated === undefined && source === source.toLocaleUpperCase('pt-BR')) {
      const original = uppercase.get(source);
      if (original) translated = catalog[original].toLocaleUpperCase(language);
    }
    if (translated === undefined) {
      for (const pattern of patterns) {
        const match = source.match(pattern.regex);
        if (!match) continue;
        const values = {};
        pattern.slots.forEach((slot, i) => { values[slot] = translate(match[i + 1], depth + 1); });
        translated = catalog[pattern.source].replace(/\{(\d+)\}/g, (_, slot) => values[slot] ?? '');
        break;
      }
    }
    if (translated === undefined) translated = fragments ? source.replace(fragments, match => {
      if (catalog[match] !== undefined) return catalog[match];
      const original = uppercase.get(match.toLocaleUpperCase('pt-BR'));
      const value = catalog[original];
      if (match === match.toLocaleUpperCase('pt-BR')) return value.toLocaleUpperCase(language);
      if (match === match.toLocaleLowerCase('pt-BR')) return value.toLocaleLowerCase(language);
      if (original === original.toLocaleUpperCase('pt-BR')) {
        return value.toLocaleLowerCase(language).replace(/\p{L}/u, letter => letter.toLocaleUpperCase(language));
      }
      return value;
    }) : source;
    const result = (raw.match(/^\s*/)?.[0] || '') + translated + (raw.match(/\s*$/)?.[0] || '');
    // HUD and canvas values change every frame. Keep this cache bounded.
    if (cache.size > 2000) cache.clear();
    cache.set(raw, result);
    return result;
  }
  function hasTranslation(value) {
    const source = normalize(String(value ?? ''));
    return Object.hasOwn(catalogs['pt-BR'], source) || uppercase.has(source.toLocaleUpperCase('pt-BR')) || patterns.some(pattern => pattern.regex.test(source));
  }

  function textNode(node) {
    if (ignored(node.parentElement)) return;
    const previous = textSources.get(node);
    const source = previous && node.data === previous.rendered ? previous.source : node.data;
    const rendered = translate(source);
    textSources.set(node, { source, rendered });
    if (node.data !== rendered) node.data = rendered;
  }
  function elementAttributes(element) {
    if (ignored(element)) return;
    const sources = attributeSources.get(element) || {};
    for (const name of attributes) {
      if (!element.hasAttribute?.(name)) continue;
      const value = element.getAttribute(name), previous = sources[name];
      const source = previous && value === previous.rendered ? previous.source : value;
      const rendered = translate(source);
      sources[name] = { source, rendered };
      if (value !== rendered) element.setAttribute(name, rendered);
    }
    attributeSources.set(element, sources);
  }
  function apply(node = root.document?.body) {
    if (!node || ignored(node.nodeType === 3 ? node.parentElement : node)) return;
    if (node.nodeType === 3) { textNode(node); return; }
    elementAttributes(node);
    if (!root.document?.createTreeWalker) return;
    const walker = root.document.createTreeWalker(node, 5); // elements and text
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === 3) textNode(walker.currentNode);
      else elementAttributes(walker.currentNode);
    }
  }
  let observer, applied = false;
  function observe() {
    if (observer || !root.MutationObserver || !root.document?.body) return;
    observer = new root.MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') textNode(record.target);
        else if (record.type === 'attributes') elementAttributes(record.target);
        else for (const node of record.addedNodes) apply(node);
      }
    });
    observer.observe(root.document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  }
  function setLanguage(code) {
    const next = locales.includes(code) ? code : 'pt-BR';
    const changed = next !== language;
    if (changed) { language = next; compile(); }
    if (root.document?.documentElement) {
      root.document.documentElement.lang = language;
      root.document.documentElement.dir = language === 'ar-SA' ? 'rtl' : 'ltr';
    }
    if (root.document?.body && (changed || !applied)) { apply(); applied = true; }
    observe();
    return language;
  }
  const prototype = root.CanvasRenderingContext2D?.prototype;
  if (prototype) {
    for (const method of ['fillText', 'strokeText', 'measureText']) {
      const original = prototype[method];
      prototype[method] = function (text, ...args) {
        // Canvas coordinates remain physical; only the rendered text changes.
        return original.call(this, translate(text), ...args);
      };
    }
  }
  root.ICEI18N = { translate, hasTranslation, setLanguage, apply, locales, get language() { return language; } };
  compile();
})(globalThis);
