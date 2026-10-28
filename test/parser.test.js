import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { tokenize, ParseError, MAX_EXPRESSION_LENGTH } from '../src/tokenizer.js';
import { compile } from '../src/compile.js';
import { toText, collectNames, dependsOn } from '../src/ast.js';

const evaluate = (text, x = 0, params) => compile(parse(text), params)(x);
const close = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('required cases from the spec', () => {
  assert.equal(evaluate('2x^2', 3), 18);
  assert.equal(evaluate('-x^2', 2), -4);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('sin(pi/2)'), 1);
  assert.equal(evaluate('ln(e)'), 1);
  assert.equal(evaluate('(x+1)(x-1)', 3), 8);
});

test('numbers: decimals and exponents', () => {
  assert.equal(evaluate('1e3'), 1000);
  assert.equal(evaluate('2.5e-1'), 0.25);
  assert.equal(evaluate('.5'), 0.5);
  assert.equal(evaluate('3.'), 3);
  assert.equal(evaluate('1E2'), 100);
  assert.equal(evaluate('1e308'), 1e308, 'the largest exponents still parse');
});

test('operator precedence and associativity', () => {
  assert.equal(evaluate('1 + 2 * 3'), 7);
  assert.equal(evaluate('8 / 4 / 2'), 1);
  assert.equal(evaluate('10 - 4 - 3'), 3);
  assert.equal(evaluate('2^-1'), 0.5);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('(-2)^2'), 4);
  assert.equal(evaluate('2*-3'), -6);
  assert.equal(evaluate('--2'), 2);
  assert.equal(evaluate('+3'), 3);
  assert.equal(evaluate('x**2', 3), 9);
  close(evaluate('e^-x^2', 1), Math.exp(-1));
});

test('implicit multiplication', () => {
  close(evaluate('3sin(x)', Math.PI / 2), 3);
  close(evaluate('2pi'), 2 * Math.PI);
  assert.equal(evaluate('x(x+1)', 2), 6);
  assert.equal(evaluate('2(x+1)', 2), 6);
  assert.equal(evaluate('x/2x', 4), 8); // (x/2)*x, same precedence as *
  assert.equal(evaluate('2^3x', 1), 8); // (2^3)x
  close(evaluate('pix', 2), 2 * Math.PI);
  assert.equal(evaluate('ax^2+bx+c', 2, { a: 1, b: 2, c: 3 }), 11);
});

test('every function and constant', () => {
  const cases = {
    'sin(1)': Math.sin(1), 'cos(1)': Math.cos(1), 'tan(1)': Math.tan(1),
    'asin(0.5)': Math.asin(0.5), 'acos(0.5)': Math.acos(0.5), 'atan(2)': Math.atan(2),
    'sinh(1)': Math.sinh(1), 'cosh(1)': Math.cosh(1), 'tanh(1)': Math.tanh(1),
    'exp(2)': Math.exp(2), 'ln(10)': Math.log(10), 'log(1000)': 3, 'log2(8)': 3,
    'sqrt(16)': 4, 'cbrt(-27)': -3, 'abs(-2)': 2, 'floor(2.7)': 2, 'ceil(2.1)': 3,
    'round(2.5)': 3, 'sign(-3)': -1, 'min(4, 2)': 2, 'max(4, 2)': 4, 'mod(-1, 3)': 2,
    'mod(7, 3)': 1, 'e': Math.E, 'pi': Math.PI,
  };
  for (const [text, expected] of Object.entries(cases)) close(evaluate(text), expected);
});

test('parameters default to 1 and follow the given values', () => {
  assert.equal(evaluate('a + b + c'), 3);
  assert.equal(evaluate('a*x + b', 2, { a: 3, b: -1 }), 5);
  assert.deepEqual([...collectNames(parse('a*cos(b*x)'))].sort(), ['a', 'b', 'x']);
  assert.equal(dependsOn(parse('2pi + a'), 'x'), false);
});

test('friendly spellings: case, unicode operators, spaces', () => {
  close(evaluate('Sin(X)', 1), Math.sin(1));
  close(evaluate('2π'), 2 * Math.PI);
  assert.equal(evaluate('6 × 7 − 2'), 40);
  assert.equal(evaluate('8 ÷ 2 · 3'), 12);
  assert.equal(evaluate('  x ^ 2  ', 4), 16);
  assert.equal(evaluate('a cos(0)', 0, { a: 2 }), 2);
  close(evaluate('acos(0)'), Math.PI / 2); // longest name wins: acos, not a*cos
});

test('tokens carry positions', () => {
  const tokens = tokenize('2pi*x');
  assert.deepEqual(
    tokens.map((t) => [t.type, t.pos]),
    [['num', 0], ['name', 1], ['op', 3], ['name', 4], ['end', 5]],
  );
});

const errorCases = [
  ['', 'empty', 0],
  ['   ', 'empty', 0],
  ['2*foo(x)', 'unknownName', 2],
  ['y + 1', 'unknownName', 0],
  ['acosh(x)', 'unknownName', 0],
  ['sin(x', 'unclosedParen', 3],
  ['(x+1', 'unclosedParen', 0],
  ['((x)', 'unclosedParen', 0],
  ['x+1)', 'unmatchedParen', 3],
  ['x))', 'unmatchedParen', 1],
  ['2+', 'unexpectedEnd', 2],
  ['2+*3', 'unexpectedToken', 2],
  ['(x+)', 'unexpectedToken', 3],
  ['1,2', 'unexpectedToken', 1],
  ['sin x', 'expectedParen', 0],
  ['min(x)', 'argCount', 0],
  ['sin()', 'argCount', 0],
  ['sin(x, 2)', 'argCount', 0],
  ['x 2', 'missingOperator', 2],
  ['sin(x)2', 'missingOperator', 6],
  ['1.2.3', 'badNumber', 0],
  ['1e999', 'hugeNumber', 0],
  ['x + 2E400', 'hugeNumber', 4],
  ['2 $ 3', 'unexpectedChar', 2],
];

test('errors report a code and the position', () => {
  for (const [text, code, pos] of errorCases) {
    assert.throws(
      () => parse(text),
      (error) => error instanceof ParseError && error.code === code && error.pos === pos,
      `${JSON.stringify(text)} should fail with ${code} at ${pos}`,
    );
  }
});

test('error messages name the problem and a 1-based position', () => {
  assert.throws(() => parse('2*foo(x)'), { message: 'Unknown name "foo" at position 3' });
  assert.throws(() => parse('sin(x'), { message: 'This "(" is never closed at position 4' });
  assert.throws(() => parse('x+1)'), { message: 'This ")" has no matching "(" at position 4' });
  assert.throws(() => parse('x'.repeat(MAX_EXPRESSION_LENGTH + 1)), { code: 'tooLong' });
});

test('toText output parses back to the same function', () => {
  const samples = [
    'x^3 - 2x + 1', '-(x + 1)^2', '(x+1)(x-1)/(x^2+4)', '2^x^2', '(2^x)^2', '-x^2', '(-x)^2',
    'x - (x - 1)', 'x/(2x)', '1/3/x', 'a*cos(b*x) + c', 'min(x, -x) - max(x^2, 1)', 'e^-x', '2(-x)',
  ];
  for (const text of samples) {
    const tree = parse(text);
    const again = parse(toText(tree));
    for (const x of [-2.5, -0.7, 0.3, 1.9]) close(compile(again)(x), compile(tree)(x));
  }
  assert.equal(toText(parse('2x^2+3')), '2x^2 + 3');
  assert.equal(toText(parse('-(x+1)')), '-(x + 1)');
  assert.equal(toText(parse('(x^2)^3')), '(x^2)^3');
});
