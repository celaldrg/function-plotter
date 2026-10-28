import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { compile } from '../src/compile.js';
import { derivative } from '../src/derivative.js';
import { simplify } from '../src/simplify.js';
import { toText } from '../src/ast.js';

const PARAMS = { a: 1.5, b: 2, c: 0.5 };
const POINTS = 50;

/** [expression, domain start, domain end] - domains avoid kinks, jumps and poles. */
const CASES = [
  ['x^3 - 2x + 1', -3, 3],
  ['sin(x)', -6, 6],
  ['cos(2x)', -4, 4],
  ['tan(x/3)', -4, 4],
  ['exp(-x^2)', -3, 3],
  ['ln(x^2 + 1)', -4, 4],
  ['sqrt(x^2 + 1)', -4, 4],
  ['1/(1 + x^2)', -4, 4],
  ['x*sin(x)', -5, 5],
  ['sin(x)/x', 0.3, 6],
  ['atan(x)', -5, 5],
  ['asin(x/5)', -4, 4],
  ['acos(x/5)', -4, 4],
  ['sinh(x/2)', -4, 4],
  ['cosh(x/2)', -4, 4],
  ['tanh(x)', -3, 3],
  ['log(x^2 + 2)', -4, 4],
  ['log2(x^2 + 3)', -4, 4],
  ['cbrt(x^2 + 1)', -4, 4],
  ['cbrt(x)', -3, -0.5],
  ['abs(x - 0.31)', -3, 3],
  ['x^x', 0.5, 3],
  ['2^x', -3, 3],
  ['e^(x/2)', -3, 3],
  ['a*cos(b*x) + c', -3, 3],
  ['(x+1)(x-1)/(x^2+4)', -4, 4],
  ['exp(sin(x))', -4, 4],
  ['sin(x)^2 + cos(x)^2', -3, 3],
  ['x^2.5', 0.2, 3],
  ['x^(-2)', 0.5, 3],
  ['max(sin(x), cos(x))', 0.1, 0.7],
  ['min(x^2, x + 2)', -0.9, 1.9],
  ['mod(x^2, 3)', 0.2, 1.6],
  ['floor(x) + x', 0.1, 0.9],
  ['sign(x)*x^2', 0.5, 2],
  ['exp(x)*ln(x + 5)', -4, 4],
  ['ln(x)^2', 0.5, 4],
  ['x/sqrt(x^2 + 1)', -4, 4],
];

/** Central difference with one Richardson step (error O(h^4)). */
function finiteDifference(f, x) {
  const h = 1e-3 * Math.max(1, Math.abs(x));
  const d1 = (f(x + h) - f(x - h)) / (2 * h);
  const d2 = (f(x + h / 2) - f(x - h / 2)) / h;
  return (4 * d2 - d1) / 3;
}

test(`symbolic derivative matches finite differences (${CASES.length} functions x ${POINTS} points)`, () => {
  assert.ok(CASES.length >= 25);
  for (const [text, lo, hi] of CASES) {
    const tree = parse(text);
    const f = compile(tree, PARAMS);
    const df = compile(derivative(tree), PARAMS);
    let checked = 0;
    for (let i = 0; i < POINTS; i += 1) {
      const x = lo + ((hi - lo) * (i + 0.5)) / POINTS;
      const exact = df(x);
      const numeric = finiteDifference(f, x);
      if (!Number.isFinite(exact) || !Number.isFinite(numeric)) continue; // only where defined
      const error = Math.abs(exact - numeric) / Math.max(1, Math.abs(exact));
      assert.ok(error < 1e-6, `${text} at x=${x}: ${exact} vs ${numeric} (rel. error ${error})`);
      checked += 1;
    }
    assert.equal(checked, POINTS, `${text}: every sample point should be defined`);
  }
});

test('derivative text is simplified', () => {
  const cases = {
    'x^2': '2x',
    'sin(x)': 'cos(x)',
    'x^3 - 2x + 1': '3x^2 - 2',
    'e^x': 'e^x',
    'ln(x)': '1/x',
    '5': '0',
    'pi*a': '0',
    'a*x': 'a',
    '2^x': '2^x*ln(2)',
    'sqrt(x)': '1/(2sqrt(x))',
    'cos(x)': '-sin(x)',
    '1/x': '-1/x^2',
    'x^2/4 - 1': '0.5x',
    'ln(x^2 + 1)': '2x/(x^2 + 1)',
    'x*sin(x)': 'sin(x) + x*cos(x)',
    'abs(x)': 'sign(x)',
    'floor(x)': '0',
    'exp(2x)': '2exp(2x)',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(toText(derivative(parse(input))), expected, `d/dx ${input}`);
  }
});

test('simplify: 0 and 1 rules and constant folding', () => {
  const cases = {
    'x + 0': 'x', '0 + x': 'x', 'x - 0': 'x', '0 - x': '-x', 'x*1': 'x', '1*x': 'x',
    'x*0': '0', 'x/1': 'x', 'x^1': 'x', 'x^0': '1', '1^x': '1', 'x - x': '0',
    '2 + 3*4': '14', '2^10': '1024', '1/4': '0.25', '1/3': '1/3', 'sqrt(16)': '4',
    'cos(0)': '1', 'ln(e)': '1', 'ln(10)': 'ln(10)', 'x*3': '3x', '2*(3*x)': '6x',
    '-(-x)': 'x', 'x + -2': 'x - 2', 'x - -2': 'x + 2', '(-x)*(-x)': 'x*x', '0.1 + 0.2': '0.3',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(toText(simplify(parse(input))), expected, `simplify ${input}`);
  }
});

test('derivative text parses back to the same derivative', () => {
  for (const [text, lo, hi] of CASES) {
    const tree = derivative(parse(text));
    const again = parse(toText(tree));
    for (const t of [0.13, 0.5, 0.87]) {
      const x = lo + (hi - lo) * t;
      const expected = compile(tree, PARAMS)(x);
      const actual = compile(again, PARAMS)(x);
      assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${text}: ${toText(tree)}`);
    }
  }
});

test('higher derivatives: d2/dx2 of x^4 is 12x^2, of sin(x) is -sin(x)', () => {
  assert.equal(toText(derivative(derivative(parse('x^4')))), '12x^2');
  assert.equal(toText(derivative(derivative(parse('sin(x)')))), '-sin(x)');
});

test('differentiating by a parameter treats x as a constant', () => {
  assert.equal(toText(derivative(parse('a*x^2 + b'), 'a')), 'x^2');
});
