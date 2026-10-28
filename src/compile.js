/**
 * Compiles an expression tree into nested closures for fast repeated evaluation.
 */
import { FUNCTIONS, CONSTANTS, DEFAULT_PARAMS } from './functions.js';

const BINARY = {
  '+': (l, r) => (x) => l(x) + r(x),
  '-': (l, r) => (x) => l(x) - r(x),
  '*': (l, r) => (x) => l(x) * r(x),
  '/': (l, r) => (x) => l(x) / r(x),
  '^': (l, r) => (x) => l(x) ** r(x),
};

function compileCall(node, params) {
  const fn = FUNCTIONS[node.name].fn;
  const [u, v] = node.args.map((arg) => compile(arg, params));
  return v ? (x) => fn(u(x), v(x)) : (x) => fn(u(x));
}

/**
 * Turns a tree into a function of x. Parameter values are bound now, so recompile after a slider moves.
 * @param {object} node expression tree from parse()
 * @param {{a?: number, b?: number, c?: number}} [params] parameter values (missing ones default to 1)
 * @returns {(x: number) => number}
 */
export function compile(node, params = DEFAULT_PARAMS) {
  switch (node.type) {
    case 'num': {
      const value = node.value;
      return () => value;
    }
    case 'const': {
      const value = CONSTANTS[node.name];
      return () => value;
    }
    case 'var': {
      if (node.name === 'x') return (x) => x;
      const value = params[node.name] ?? DEFAULT_PARAMS[node.name];
      return () => value;
    }
    case 'neg': {
      const arg = compile(node.arg, params);
      return (x) => -arg(x);
    }
    case 'bin':
      return BINARY[node.op](compile(node.left, params), compile(node.right, params));
    default:
      return compileCall(node, params);
  }
}
