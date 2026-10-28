/**
 * Symbolic differentiation: sum, product, quotient and chain rules, the power rule for
 * constant exponents and the general u^v through exp/ln. Results are simplified as they are built.
 */
import { num, dependsOn } from './ast.js';
import { simplify, add, sub, mul, div, pow, negate, apply } from './simplify.js';

const ONE = num(1);
const TWO = num(2);
const zero = () => num(0);
const fn = (name, ...args) => apply(name, args);
const oneOverSqrtOneMinusSquare = (u) => div(ONE, fn('sqrt', sub(ONE, pow(u, TWO))));

/** f'(u) for single-argument functions; the chain rule multiplies by u'. */
const UNARY_RULES = {
  sin: (u) => fn('cos', u),
  cos: (u) => negate(fn('sin', u)),
  tan: (u) => div(ONE, pow(fn('cos', u), TWO)),
  asin: (u) => oneOverSqrtOneMinusSquare(u),
  acos: (u) => negate(oneOverSqrtOneMinusSquare(u)),
  atan: (u) => div(ONE, add(ONE, pow(u, TWO))),
  sinh: (u) => fn('cosh', u),
  cosh: (u) => fn('sinh', u),
  tanh: (u) => sub(ONE, pow(fn('tanh', u), TWO)),
  exp: (u) => fn('exp', u),
  ln: (u) => div(ONE, u),
  log: (u) => div(ONE, mul(u, fn('ln', num(10)))),
  log2: (u) => div(ONE, mul(u, fn('ln', TWO))),
  sqrt: (u) => div(ONE, mul(TWO, fn('sqrt', u))),
  cbrt: (u) => div(ONE, mul(num(3), pow(fn('cbrt', u), TWO))),
  abs: (u) => fn('sign', u),
  floor: zero,
  ceil: zero,
  round: zero,
  sign: zero,
};

/** Full derivatives for two-argument functions, given [u, v] and [u', v']. */
const BINARY_RULES = {
  // min(u, v) = (u + v)/2 - |u - v|/2, max(u, v) = (u + v)/2 + |u - v|/2
  min: ([u, v], [du, dv]) => div(sub(add(du, dv), mul(fn('sign', sub(u, v)), sub(du, dv))), TWO),
  max: ([u, v], [du, dv]) => div(add(add(du, dv), mul(fn('sign', sub(u, v)), sub(du, dv))), TWO),
  // mod(u, v) = u - v*floor(u/v)
  mod: ([u, v], [du, dv]) => sub(du, mul(dv, fn('floor', div(u, v)))),
};

function diffPower(u, v, du, dv, name) {
  if (!dependsOn(v, name)) return mul(mul(v, pow(u, sub(v, ONE))), du);
  if (!dependsOn(u, name)) return mul(mul(pow(u, v), fn('ln', u)), dv);
  return mul(pow(u, v), add(mul(dv, fn('ln', u)), div(mul(v, du), u)));
}

function diffQuotient(u, v, du, dv, name) {
  if (!dependsOn(v, name)) return div(du, v);
  return div(sub(mul(du, v), mul(u, dv)), pow(v, TWO));
}

function diffBinary(node, name) {
  const { op, left: u, right: v } = node;
  const du = diff(u, name);
  const dv = diff(v, name);
  switch (op) {
    case '+':
      return add(du, dv);
    case '-':
      return sub(du, dv);
    case '*':
      return add(mul(du, v), mul(u, dv));
    case '/':
      return diffQuotient(u, v, du, dv, name);
    default:
      return diffPower(u, v, du, dv, name);
  }
}

function diffCall(node, name) {
  const derivatives = node.args.map((arg) => diff(arg, name));
  if (node.args.length === 2) return BINARY_RULES[node.name](node.args, derivatives);
  return mul(UNARY_RULES[node.name](node.args[0]), derivatives[0]);
}

function diff(node, name) {
  switch (node.type) {
    case 'num':
    case 'const':
      return num(0);
    case 'var':
      return num(node.name === name ? 1 : 0);
    case 'neg':
      return negate(diff(node.arg, name));
    case 'bin':
      return diffBinary(node, name);
    default:
      return diffCall(node, name);
  }
}

/**
 * Symbolic derivative of an expression tree, simplified.
 * @param {object} node expression tree from parse()
 * @param {string} [name] variable to differentiate by (default "x"; a, b, c count as constants)
 * @returns {object} derivative tree
 */
export function derivative(node, name = 'x') {
  return diff(simplify(node), name);
}
