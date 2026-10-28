import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlotter, createDemoState, normalizeState, encodeState, decodeState, evaluateConstant,
  MAX_FUNCTIONS, COLORS, PARAM_RANGE,
} from '../src/plotter.js';
import { DEFAULT_VIEW } from '../src/viewport.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('a normal visit starts with one valid function and the default view', () => {
  const plotter = createPlotter();
  const [first] = plotter.listFunctions();
  assert.equal(first.expr, 'sin(x)');
  assert.equal(first.error, null);
  assert.equal(first.derivativeText, 'cos(x)');
  assert.deepEqual(plotter.getState().view, { ...DEFAULT_VIEW });
  assert.deepEqual(plotter.usedParams(), []);
});

test('up to six functions, each with its own colour', () => {
  const plotter = createPlotter();
  for (let i = 1; i < MAX_FUNCTIONS; i += 1) assert.ok(plotter.addFunction(`x^${i}`));
  assert.equal(plotter.addFunction('x'), null);
  const colors = plotter.listFunctions().map((f) => f.color);
  assert.deepEqual(colors, [...COLORS]);
  const [, second] = plotter.listFunctions();
  plotter.removeFunction(second.id);
  assert.equal(plotter.listFunctions().length, MAX_FUNCTIONS - 1);
  assert.ok(plotter.addFunction('x'));
  assert.equal(plotter.listFunctions().at(-1).color, second.color, 'a freed colour is reused');
});

test('expressions report live errors with position', () => {
  const plotter = createPlotter();
  const id = plotter.addFunction('2x +');
  assert.equal(plotter.listFunctions()[1].error.code, 'unexpectedEnd');
  const error = plotter.setExpression(id, 'sin(x');
  assert.deepEqual([error.code, error.pos], ['unclosedParen', 3]);
  assert.equal(plotter.setExpression(id, 'sin(x)^2'), null);
  assert.equal(plotter.curves().length, 2);
  plotter.setExpression(id, 'foo');
  assert.equal(plotter.curves().length, 1, 'invalid functions are not drawn');
});

test('sliders: used parameters are detected and drive the curves', () => {
  const plotter = createPlotter({ functions: [{ expr: 'a*x + c' }] });
  assert.deepEqual(plotter.usedParams(), ['a', 'c']);
  plotter.setParam('a', 3);
  plotter.setParam('c', -2);
  assert.deepEqual(plotter.table(1, 1, 2).rows.map((r) => r.values[0]), [1, 4]);
  plotter.setParam('a', 99);
  assert.equal(plotter.getState().params.a, PARAM_RANGE.max);
  plotter.setParam('z', 1);
  plotter.setParam('b', NaN);
  assert.deepEqual(plotter.getState().params, { a: 5, b: 1, c: -2 });
});

test('hidden functions are skipped by curves, markers and table', () => {
  const plotter = createPlotter({ functions: [{ expr: 'x' }, { expr: 'x^2 - 1' }] });
  plotter.setToggle('roots', true);
  plotter.setVisible(2, false);
  assert.deepEqual(plotter.curves().map((c) => c.id), [1]);
  assert.equal(plotter.markers().roots.length, 1);
  assert.equal(plotter.table(0, 1, 3).columns.length, 1);
});

test('curves include the derivative when the toggle is on', () => {
  const plotter = createPlotter({ functions: [{ expr: 'x^2' }] });
  assert.equal(plotter.curves()[0].derivative, null);
  plotter.setToggle('derivative', true);
  const [curve] = plotter.curves({ xMin: -2, xMax: 2, yMin: -4, yMax: 4 }, { tolerance: 0.01 });
  for (const p of curve.derivative[0]) near(p.y, 2 * p.x);
});

test('the derivative is drawn only where the function is defined', () => {
  // The simplifier turns each of these derivatives into 0, which on its own is defined everywhere.
  const cases = [
    ['sqrt(x) - sqrt(x)', (x) => x >= 0],
    ['ln(x)*0', (x) => x > 0],
    ['floor(sqrt(x))', (x) => x >= 0],
  ];
  for (const [expr, inDomain] of cases) {
    const plotter = createPlotter({ functions: [{ expr }], show: { derivative: true } });
    const [curve] = plotter.curves({ xMin: -4, xMax: 4, yMin: -3, yMax: 3 });
    const points = curve.derivative.flat();
    assert.ok(points.length > 0, `${expr}: the derivative is drawn on the domain`);
    assert.ok(points.every((p) => inDomain(p.x)), `${expr}: derivative drawn outside the domain`);
  }
});

test('markers: roots, extrema and intersections in the visible range', () => {
  const plotter = createPlotter({
    functions: [{ expr: 'x^2' }, { expr: 'x + 2' }],
    show: { roots: true, extrema: true, intersections: true },
    view: { xMin: -5, xMax: 5, yMin: -3, yMax: 7 },
  });
  const { roots, extrema, intersections } = plotter.markers();
  assert.deepEqual(roots.map((r) => [r.id, r.x]), [[1, 0], [2, -2]]);
  assert.deepEqual(extrema.map((e) => [e.id, e.kind, e.x, e.y]), [[1, 'min', 0, 0]]);
  assert.equal(intersections.length, 2);
  near(intersections[0].x, -1);
  near(intersections[1].x, 2);
  assert.deepEqual(intersections[0].ids, [1, 2]);
});

test('the integral tool shades the area and reports the value', () => {
  const plotter = createPlotter({ functions: [{ expr: 'x^2' }] });
  assert.equal(plotter.integral(), null);
  plotter.setIntegral({ enabled: true, from: 0, to: 3 });
  const result = plotter.integral();
  near(result.value, 9);
  assert.equal(result.segments[0][0].x, 0);
  assert.equal(result.segments[0].at(-1).x, 3);
  plotter.setIntegral({ from: 3, to: 0 });
  near(plotter.integral().value, -9);
  plotter.removeFunction(1);
  assert.equal(plotter.integral(), null);
});

test('the shaded area is sampled only inside the view; the value follows the function', () => {
  const plotter = createPlotter({ functions: [{ expr: 'a*x' }], view: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 } });
  plotter.setIntegral({ enabled: true, from: 0, to: 3 });
  const first = plotter.integral();
  near(first.value, 4.5);
  assert.equal(first.segments[0][0].x, 0);
  assert.equal(first.segments.at(-1).at(-1).x, 2, 'clipped at the right edge of the view');
  plotter.setParam('a', 2);
  near(plotter.integral().value, 9, 1e-9);
  plotter.setView({ xMin: 5, xMax: 9, yMin: -2, yMax: 2 });
  const outside = plotter.integral();
  assert.deepEqual(outside.segments, []);
  near(outside.value, 9, 1e-9);
});

test('trace snaps to the nearest curve', () => {
  const plotter = createPlotter({ functions: [{ expr: 'sin(x)' }, { expr: '2' }] });
  const hit = plotter.trace(Math.PI / 2, 1.1, 0.02, 0.02);
  assert.equal(hit.id, 1);
  near(hit.x, Math.PI / 2);
  near(hit.y, 1);
  assert.equal(plotter.trace(0, 1.9, 0.02, 0.02).id, 2);
  assert.equal(plotter.trace(0, -3, 0.02, 0.02), null);
});

test('the whole state round-trips through the URL hash', () => {
  const plotter = createPlotter(createDemoState());
  plotter.setVisible(2, false);
  plotter.setToggle('extrema', true);
  plotter.setView({ xMin: -3.25, xMax: 7.5, yMin: -2, yMax: 4.125 });
  const hash = plotter.toHash();
  assert.deepEqual(decodeState(`#${hash}`), plotter.getState());
  assert.equal(encodeState(decodeState(hash)), hash);
});

test('malformed hashes never throw and fall back to safe values', () => {
  assert.equal(decodeState(''), null);
  assert.equal(decodeState('#nothing=here'), null);
  const state = decodeState('#f=sin(x)&a=abc&b=1e9&v=1,0,0,1&show=zz&int=x');
  assert.equal(state.functions[0].expr, 'sin(x)');
  assert.equal(state.params.a, 1);
  assert.equal(state.params.b, PARAM_RANGE.max);
  assert.deepEqual(state.view, { ...DEFAULT_VIEW });
  assert.equal(state.integral.enabled, false);
  assert.ok(Object.values(state.show).every((on) => on === false));
  const many = decodeState(Array.from({ length: 9 }, (_, i) => `f=x%2B${i}`).join('&'));
  assert.equal(many.functions.length, MAX_FUNCTIONS);
  assert.deepEqual(normalizeState({ functions: [{ id: 5 }, { id: 5 }] }).functions.map((f) => f.id), [1, 2]);
});

test('?demo builds the same rich state every time', () => {
  const demo = createDemoState();
  assert.deepEqual(createDemoState(), demo);
  assert.deepEqual(demo.functions.map((f) => f.expr), ['sin(x)', 'x^2/4 - 1', 'a*cos(b*x)']);
  const plotter = createPlotter(demo);
  assert.deepEqual(plotter.usedParams(), ['a', 'b']);
  const markers = plotter.markers();
  assert.ok(markers.roots.length >= 5);
  assert.ok(markers.intersections.length >= 4);
  near(plotter.integral().value, 2);
  assert.ok(plotter.listFunctions().every((f) => f.error === null));
});

test('number fields accept constant expressions only', () => {
  near(evaluateConstant('pi/2'), Math.PI / 2);
  assert.equal(evaluateConstant('-1.5'), -1.5);
  assert.equal(evaluateConstant('2e3'), 2000);
  assert.equal(evaluateConstant('2a', { a: 3 }), 6);
  assert.ok(Number.isNaN(evaluateConstant('x + 1')));
  assert.ok(Number.isNaN(evaluateConstant('2+')));
  assert.ok(Number.isNaN(evaluateConstant('')));
  assert.ok(Number.isNaN(evaluateConstant('1e999')), 'too large, not Infinity');
});

test('view changes: invalid windows are ignored, reset restores the default', () => {
  const plotter = createPlotter();
  plotter.setView({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  plotter.setView({ xMin: 1, xMax: 0, yMin: 0, yMax: 1 });
  assert.deepEqual(plotter.getState().view, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  plotter.resetView();
  assert.deepEqual(plotter.getState().view, { ...DEFAULT_VIEW });
});
