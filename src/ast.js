/**
 * Expression tree nodes and helpers. Nodes are plain frozen objects:
 *   {type:'num', value} {type:'var', name} {type:'const', name}
 *   {type:'neg', arg} {type:'bin', op, left, right} {type:'call', name, args}
 */

/** @param {number} value @returns {object} number literal */
export const num = (value) => Object.freeze({ type: 'num', value });
/** @param {string} name x, a, b or c @returns {object} variable node */
export const variable = (name) => Object.freeze({ type: 'var', name });
/** @param {string} name pi or e @returns {object} constant node */
export const constant = (name) => Object.freeze({ type: 'const', name });
/** @param {object} arg @returns {object} unary minus node */
export const neg = (arg) => Object.freeze({ type: 'neg', arg });
/** @param {string} op + - * / ^ @param {object} left @param {object} right @returns {object} */
export const bin = (op, left, right) => Object.freeze({ type: 'bin', op, left, right });
/** @param {string} name function name @param {object[]} args @returns {object} */
export const call = (name, args) => Object.freeze({ type: 'call', name, args: Object.freeze([...args]) });

/** @param {object} node @param {number} [value] @returns {boolean} true for a number literal (equal to value) */
export function isNum(node, value) {
  return node.type === 'num' && (value === undefined || node.value === value);
}

function children(node) {
  if (node.type === 'neg') return [node.arg];
  if (node.type === 'bin') return [node.left, node.right];
  if (node.type === 'call') return node.args;
  return [];
}

/**
 * Collects the variable names (x, a, b, c) used in a tree.
 * @param {object} node
 * @returns {Set<string>}
 */
export function collectNames(node, found = new Set()) {
  if (node.type === 'var') found.add(node.name);
  for (const child of children(node)) collectNames(child, found);
  return found;
}

/**
 * @param {object} node
 * @param {string} name variable name
 * @returns {boolean} whether the tree mentions the variable
 */
export function dependsOn(node, name) {
  return node.type === 'var' ? node.name === name : children(node).some((c) => dependsOn(c, name));
}

/**
 * Structural equality of two trees.
 * @param {object} p
 * @param {object} q
 * @returns {boolean}
 */
export function equal(p, q) {
  if (p.type !== q.type) return false;
  if (p.type === 'num') return p.value === q.value;
  if (p.type === 'var' || p.type === 'const') return p.name === q.name;
  if (p.type === 'bin' && p.op !== q.op) return false;
  if (p.type === 'call' && (p.name !== q.name || p.args.length !== q.args.length)) return false;
  const a = children(p);
  const b = children(q);
  return a.every((child, i) => equal(child, b[i]));
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
const UNARY = 3;
const ATOM = 5;

function precedence(node) {
  if (node.type === 'bin') return PRECEDENCE[node.op];
  if (node.type === 'neg' || (node.type === 'num' && node.value < 0)) return UNARY;
  return ATOM;
}

const wrap = (text, needed) => (needed ? `(${text})` : text);

function binaryText({ op, left, right }) {
  const pl = precedence(left);
  const pr = precedence(right);
  const l = toText(left);
  const r = toText(right);
  switch (op) {
    case '+':
      return `${l} + ${r}`;
    case '-':
      return `${l} - ${wrap(r, pr <= 1 || pr === UNARY)}`;
    case '*': {
      const lt = wrap(l, pl < 2);
      const rt = wrap(r, pr < 2 || pr === UNARY);
      return isNum(left) && /^[a-z(]/.test(rt) ? lt + rt : `${lt}*${rt}`;
    }
    case '/':
      return `${wrap(l, pl < 2)}/${wrap(r, pr <= UNARY)}`;
    default:
      return `${wrap(l, pl <= 4)}^${wrap(r, pr < 4)}`;
  }
}

/**
 * Formats a tree as text the parser reads back to the same function,
 * e.g. "3x^2 - 2", "2x/(x^2 + 1)", "-sin(x)".
 * @param {object} node
 * @returns {string}
 */
export function toText(node) {
  switch (node.type) {
    case 'num':
      return String(node.value);
    case 'var':
    case 'const':
      return node.name;
    case 'neg': {
      const p = precedence(node.arg);
      return `-${wrap(toText(node.arg), p <= 1 || p === UNARY)}`;
    }
    case 'bin':
      return binaryText(node);
    default:
      return `${node.name}(${node.args.map(toText).join(', ')})`;
  }
}
