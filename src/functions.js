/**
 * Name tables shared by the tokenizer, parser, compiler and differentiator.
 * Pure data, no side effects.
 */

/** The single independent variable. */
export const VARIABLE = 'x';

/** Slider-driven parameters, in display order. */
export const PARAMS = Object.freeze(['a', 'b', 'c']);

/** Value used for a parameter that has not been set. */
export const DEFAULT_PARAMS = Object.freeze({ a: 1, b: 1, c: 1 });

/** Named constants and their values. */
export const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });

/**
 * Mathematical modulo: the result has the sign of the divisor, so mod(-1, 3) = 2.
 * @param {number} u dividend
 * @param {number} v divisor
 * @returns {number}
 */
export function mod(u, v) {
  return u - v * Math.floor(u / v);
}

const unary = (fn) => Object.freeze({ arity: 1, fn });
const binary = (fn) => Object.freeze({ arity: 2, fn });

/** Built-in functions: number of arguments and numeric implementation. */
export const FUNCTIONS = Object.freeze({
  sin: unary(Math.sin),
  cos: unary(Math.cos),
  tan: unary(Math.tan),
  asin: unary(Math.asin),
  acos: unary(Math.acos),
  atan: unary(Math.atan),
  sinh: unary(Math.sinh),
  cosh: unary(Math.cosh),
  tanh: unary(Math.tanh),
  exp: unary(Math.exp),
  ln: unary(Math.log),
  log: unary(Math.log10),
  log2: unary(Math.log2),
  sqrt: unary(Math.sqrt),
  cbrt: unary(Math.cbrt),
  abs: unary(Math.abs),
  floor: unary(Math.floor),
  ceil: unary(Math.ceil),
  round: unary(Math.round),
  sign: unary(Math.sign),
  min: binary(Math.min),
  max: binary(Math.max),
  mod: binary(mod),
});

/** Every reserved name, longest first, so "sinh" wins over "sin" and "asin" over "a". */
export const NAMES = Object.freeze(
  [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), ...PARAMS, VARIABLE].sort(
    (p, q) => q.length - p.length,
  ),
);
