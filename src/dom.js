/**
 * Small DOM helpers for the UI modules: element creation without innerHTML, the icon set,
 * and applying translated strings to elements marked with data-i18n attributes.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const EYE = ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z'];

/** Stroke paths on a 24 x 24 grid. */
const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  eye: EYE,
  eyeOff: [...EYE, 'M4 4l16 16'],
  target: ['M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14z', 'M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4'],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  restart: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v5h5'],
};

/**
 * Creates an element.
 * @param {string} tag
 * @param {{className?: string, text?: string, attrs?: Object<string, string>, on?: Object<string, Function>}} [props]
 *   other keys are assigned as DOM properties (type, value, id, ...)
 * @param {...(Node|string|null|undefined)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const { attrs = {}, on = {}, text, ...rest } = props;
  Object.assign(node, rest);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const [type, handler] of Object.entries(on)) node.addEventListener(type, handler);
  if (text !== undefined) node.textContent = text;
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

/**
 * A decorative stroke icon.
 * @param {keyof typeof ICONS} name
 * @returns {SVGSVGElement}
 */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Puts the icon named by data-icon at the start of each marked element. */
export function insertIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) node.prepend(icon(node.dataset.icon));
}

/**
 * Fills marked elements with translated strings: data-i18n (text), data-i18n-label (aria-label),
 * data-i18n-title (tooltip).
 * @param {(key: string) => string} translate
 * @param {ParentNode} [root]
 */
export function applyTranslations(translate, root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = translate(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-label]')) {
    node.setAttribute('aria-label', translate(node.dataset.i18nLabel));
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) node.title = translate(node.dataset.i18nTitle);
}
