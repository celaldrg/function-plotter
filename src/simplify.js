/**
 * Simplifying node builders (0 and 1 rules, sign handling, constant folding) and simplify().
 */
import { num, neg, bin, call, isNum, equal } from './ast.js';
import { FUNCTIONS } from './functions.js';

const clean = (value) => Number(value.toPrecision(15));
/** True when a value has a short decimal form (1/4 yes, 1/3 or ln(10) no), so folding keeps text tidy. */
const isShort = (value) => Number.isFinite(value) && Number(value.toPrecision(12)) === clean(value);

const ARITHMETIC = {
  '+': (p, q) => p + q,
  '-': (p, q) => p - q,
  '*': (p, q) => p * q,
  '/': (p, q) => p / q,
  '^': (p, q) => p ** q,
};

function fold(op, l, r) {
  if (!isNum(l) || !isNum(r)) return null;
  const value = ARITHMETIC[op](l.value, r.value);
  if (!Number.isFinite(value)) return null;
  if ((op === '/' || op === '^') && !isShort(value)) return null;
  return num(clean(value));
}

const isReciprocal = (node) => node.type === 'bin' && node.op === '/' && isNum(node.left, 1);

/** @param {object} a @returns {object} simplified -a */
export function negate(a) {
  if (isNum(a)) return num(a.value === 0 ? 0 : -a.value);
  return a.type === 'neg' ? a.arg : neg(a);
}

/** @param {object} l @param {object} r @returns {object} simplified l + r */
export function add(l, r) {
  const folded = fold('+', l, r);
  if (folded) return folded;
  if (isNum(l, 0)) return r;
  if (isNum(r, 0)) return l;
  if (r.type === 'neg') return sub(l, r.arg);
  if (isNum(r) && r.value < 0) return sub(l, num(-r.value));
  if (l.type === 'neg') return sub(r, l.arg);
  return bin('+', l, r);
}

/** @param {object} l @param {object} r @returns {object} simplified l - r */
export function sub(l, r) {
  const folded = fold('-', l, r);
  if (folded) return folded;
  if (isNum(r, 0)) return l;
  if (isNum(l, 0)) return negate(r);
  if (r.type === 'neg') return add(l, r.arg);
  if (isNum(r) && r.value < 0) return add(l, num(-r.value));
  if (equal(l, r)) return num(0);
  return bin('-', l, r);
}

/** @param {object} l @param {object} r @returns {object} simplified l * r (numeric factor first) */
export function mul(l, r) {
  const folded = fold('*', l, r);
  if (folded) return folded;
  if (isNum(l, 0) || isNum(r, 0)) return num(0);
  if (isNum(l, 1)) return r;
  if (isNum(r, 1)) return l;
  if (isNum(r) && !isNum(l)) return mul(r, l);
  if (isNum(l, -1)) return negate(r);
  if (l.type === 'neg') return negate(mul(l.arg, r));
  if (r.type === 'neg') return negate(mul(l, r.arg));
  if (isNum(l) && r.type === 'bin' && r.op === '*' && isNum(r.left)) return mul(mul(l, r.left), r.right);
  if (isReciprocal(l)) return div(r, l.right);
  if (isReciprocal(r)) return div(l, r.right);
  return bin('*', l, r);
}

/** @param {object} l @param {object} r @returns {object} simplified l / r */
export function div(l, r) {
  const folded = fold('/', l, r);
  if (folded) return folded;
  if (isNum(l, 0)) return num(0);
  if (isNum(r, 1)) return l;
  if (isNum(r) && l.type === 'bin' && l.op === '*' && isNum(l.left)) {
    const coefficient = fold('/', l.left, r); // 2x/4 -> 0.5x
    if (coefficient) return mul(coefficient, l.right);
  }
  if (l.type === 'neg') return negate(div(l.arg, r));
  if (r.type === 'neg') return negate(div(l, r.arg));
  return bin('/', l, r);
}

/** @param {object} l @param {object} r @returns {object} simplified l ^ r */
export function pow(l, r) {
  const folded = fold('^', l, r);
  if (folded) return folded;
  if (isNum(r, 0) || isNum(l, 1)) return num(1);
  if (isNum(r, 1)) return l;
  return bin('^', l, r);
}

/**
 * Builds a function call, folding constant arguments when the result is tidy (sqrt(4) = 2, ln(e) = 1).
 * @param {string} name function name
 * @param {object[]} args argument trees
 * @returns {object}
 */
export function apply(name, args) {
  if (name === 'ln' && args[0].type === 'const' && args[0].name === 'e') return num(1);
  if (args.every((arg) => isNum(arg))) {
    const value = FUNCTIONS[name].fn(...args.map((arg) => arg.value));
    if (isShort(value)) return num(clean(value));
  }
  return call(name, args);
}

const BUILDERS = { '+': add, '-': sub, '*': mul, '/': div, '^': pow };

/**
 * Simplifies a tree bottom-up with the builders above.
 * @param {object} node
 * @returns {object}
 */
export function simplify(node) {
  switch (node.type) {
    case 'neg':
      return negate(simplify(node.arg));
    case 'bin':
      return BUILDERS[node.op](simplify(node.left), simplify(node.right));
    case 'call':
      return apply(node.name, node.args.map(simplify));
    default:
      return node;
  }
}
