import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { compile } from '../src/compile.js';
import { derivative } from '../src/derivative.js';
import { brent, findRoots, findIntersections, findExtrema, integrate, valuesTable } from '../src/analysis.js';

const fn = (text) => compile(parse(text));
const dfn = (text) => compile(derivative(parse(text)));
const near = (actual, expected, tol) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} differs from ${expected} by more than ${tol}`);

test('the root of x^2 - 2 in [0, 2] is sqrt(2)', () => {
  const roots = findRoots(fn('x^2 - 2'), 0, 2);
  assert.equal(roots.length, 1);
  near(roots[0], Math.SQRT2, 1e-9);
});

test('the root of sin(x) in [3, 4] is pi', () => {
  const roots = findRoots(fn('sin(x)'), 3, 4);
  assert.equal(roots.length, 1);
  near(roots[0], Math.PI, 1e-9);
});

test("Brent's method converges on a bracket and rejects a non-bracket", () => {
  near(brent((x) => x ** 3 - x - 2, 1, 2), 1.5213797068045676, 1e-12);
  near(brent(Math.cos, 0, 3), Math.PI / 2, 1e-12);
  near(brent((x) => Math.exp(x) - 10, -5, 5), Math.log(10), 1e-12);
  assert.ok(Number.isNaN(brent((x) => x * x + 1, -1, 1)));
  assert.equal(brent((x) => x - 2, 2, 5), 2);
});

test('all roots in a range, ascending, including exact grid hits', () => {
  const roots = findRoots(fn('x^3 - x'), -2, 2);
  assert.equal(roots.length, 3);
  [-1, 0, 1].forEach((r, i) => near(roots[i], r, 1e-9));
  const sines = findRoots(fn('sin(x)'), -10, 10);
  assert.deepEqual(sines.map((r) => Math.round(r / Math.PI)), [-3, -2, -1, 0, 1, 2, 3]);
  sines.forEach((r) => near(r, Math.round(r / Math.PI) * Math.PI, 1e-9));
});

test('poles and jumps are not reported as roots', () => {
  assert.deepEqual(findRoots(fn('tan(x)'), -2, 2), [0]);
  assert.deepEqual(findRoots(fn('1/x'), -1, 1), []);
  assert.deepEqual(findRoots(fn('floor(x) - 0.5'), -3, 3), []);
  assert.deepEqual(findRoots(fn('0'), -3, 3), []); // a constant zero has no isolated roots
  assert.deepEqual(findRoots(fn('x^2 + 1'), -3, 3), []);
});

test('the intersections of x^2 and x + 2 are -1 and 2', () => {
  for (const [lo, hi] of [[-5, 5], [-3.3, 3.7], [-1.7, 2.9]]) {
    const points = findIntersections(fn('x^2'), fn('x + 2'), lo, hi);
    assert.equal(points.length, 2);
    near(points[0].x, -1, 1e-9);
    near(points[1].x, 2, 1e-9);
    near(points[0].y, 1, 1e-8);
    near(points[1].y, 4, 1e-8);
  }
  assert.deepEqual(findIntersections(fn('sin(x)'), fn('sin(x)'), -3, 3), []);
});

test('local extrema come from the roots of the derivative', () => {
  const cubic = findExtrema(fn('x^3 - 3x'), dfn('x^3 - 3x'), -3, 3);
  assert.equal(cubic.length, 2);
  assert.equal(cubic[0].kind, 'max');
  near(cubic[0].x, -1, 1e-9);
  near(cubic[0].y, 2, 1e-9);
  assert.equal(cubic[1].kind, 'min');
  near(cubic[1].x, 1, 1e-9);
  near(cubic[1].y, -2, 1e-9);
  const cosine = findExtrema(fn('cos(x)'), dfn('cos(x)'), -4, 4);
  assert.deepEqual(cosine.map((p) => p.kind), ['min', 'max', 'min']);
  near(cosine[0].x, -Math.PI, 1e-9);
});

test('extrema: kinks count, poles and flat inflections do not', () => {
  const kink = findExtrema(fn('abs(x - 0.31)'), dfn('abs(x - 0.31)'), -2, 2);
  assert.equal(kink.length, 1);
  assert.equal(kink[0].kind, 'min');
  near(kink[0].x, 0.31, 1e-9);
  const poles = findExtrema(fn('tan(x)^2'), dfn('tan(x)^2'), -2, 2);
  assert.equal(poles.length, 1);
  near(poles[0].x, 0, 1e-12);
  assert.deepEqual(findExtrema(fn('x^3'), dfn('x^3'), -2, 2), []);
  assert.deepEqual(findExtrema(fn('floor(x)'), dfn('floor(x)'), -3, 3), []);
  assert.deepEqual(findExtrema(fn('tan(x)'), dfn('tan(x)'), -5, 5), []);
});

test('definite integrals by adaptive Simpson', () => {
  near(integrate(fn('sin(x)'), 0, Math.PI), 2, 1e-9);
  near(integrate(fn('x^2'), 0, 3), 9, 1e-9);
  near(integrate(fn('x^2'), 3, 0), -9, 1e-9);
  near(integrate(fn('exp(-x^2)'), -10, 10), Math.sqrt(Math.PI), 1e-9);
  near(integrate(fn('1/x'), 1, Math.E), 1, 1e-9);
  near(integrate(fn('sqrt(1 - x^2)'), -1, 1), Math.PI / 2, 1e-6);
  near(integrate(fn('floor(x)'), 0, 3.5), 4.5, 1e-9);
  assert.equal(integrate(fn('x'), 2, 2), 0);
  assert.ok(Number.isNaN(integrate(fn('1/x'), -1, 1)), 'diverges across the pole');
});

test('integrals across a pole are reported as undefined, integrable kinks are not', () => {
  assert.ok(Number.isNaN(integrate(fn('1/x'), -1, 2)), 'pole off the midpoint');
  assert.ok(Number.isNaN(integrate(fn('tan(x)'), 0, 3)), 'tan(x) across pi/2');
  assert.ok(Number.isNaN(integrate(fn('1/(x - 0.3)^2'), 0, 1)));
  assert.ok(Number.isNaN(integrate(fn('sqrt(x)'), -1, 4)), 'undefined on part of the range');
  near(integrate(fn('abs(x - 0.3)'), -1, 1), 1.09, 1e-9);
  near(integrate(fn('sqrt(x)'), 0, 4), 16 / 3, 1e-8);
  near(integrate(fn('1/x'), 1, 1000), Math.log(1000), 1e-8);
});

test('a table of values has clean x values', () => {
  const rows = valuesTable([fn('x^2'), fn('2x')], -1, 0.1, 21);
  assert.equal(rows.length, 21);
  assert.deepEqual(rows.slice(0, 4).map((r) => r.x), [-1, -0.9, -0.8, -0.7]);
  assert.equal(rows[10].x, 0);
  assert.equal(rows[20].x, 1);
  near(rows[3].values[0], 0.49, 1e-12);
  assert.equal(rows[20].values[1], 2);
});
