import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceStep, generateTicks, formatTick, formatNumber, formatConstant } from '../src/ticks.js';
import { evaluateConstant } from '../src/plotter.js';

const RANGES = [
  [-10, 10], [0, 1], [-1, 1], [0, 0.3], [-5.3, 7.9], [1000, 1000.01], [-3e-7, 5e-7], [0, 3e9],
  [-123.4, -120.1], [0.001, 0.0013], [-2.5e6, 7.5e6], [17, 23], [-0.07, 0.04], [99.5, 100.5],
  [-1e8, 1e8], [3.14159, 3.1416], [-12345, 67890], [0.5, 0.75], [-40, -39.999], [2e-5, 9e-5],
];

const mantissaOf = (step) => step / 10 ** Math.floor(Math.log10(step));

test(`nice steps (1, 2 or 5 x 10^k) for ${RANGES.length} ranges`, () => {
  assert.equal(RANGES.length, 20);
  for (const [min, max] of RANGES) {
    const { step, ticks } = generateTicks(min, max);
    const mantissa = mantissaOf(step);
    assert.ok([1, 2, 5].some((m) => Math.abs(mantissa - m) < 1e-9), `step ${step} for [${min}, ${max}]`);
    assert.ok(ticks.length >= 4 && ticks.length <= 17, `${ticks.length} ticks for [${min}, ${max}]`);
    for (let i = 0; i < ticks.length; i += 1) {
      const { value, label } = ticks[i];
      assert.ok(value >= min - step * 1e-9 && value <= max + step * 1e-9, `${value} outside [${min}, ${max}]`);
      assert.ok(Math.abs(value / step - Math.round(value / step)) < 1e-6, `${value} is not a multiple of ${step}`);
      if (i > 0) assert.ok(Math.abs(value - ticks[i - 1].value - step) <= step * 1e-6, 'evenly spaced');
      assert.ok(label.length <= 12, `label "${label}" too long`);
      const decimals = label.includes('e') ? 0 : (label.split('.')[1] ?? '').length;
      assert.ok(decimals <= Math.max(0, -Math.floor(Math.log10(step))), `label "${label}" shows floating-point noise`);
      assert.ok(Math.abs(Number(label) - value) <= step * 1e-6, `label "${label}" does not read back as ${value}`);
    }
  }
});

test('niceStep picks the closest nice number', () => {
  assert.deepEqual(niceStep(10, 10), { mantissa: 1, exponent: 0, step: 1 });
  assert.deepEqual(niceStep(20, 8), { mantissa: 2, exponent: 0, step: 2 });
  assert.deepEqual(niceStep(40, 8), { mantissa: 5, exponent: 0, step: 5 });
  assert.deepEqual(niceStep(80, 8), { mantissa: 1, exponent: 1, step: 10 });
  assert.deepEqual(niceStep(0.016, 8), { mantissa: 2, exponent: -3, step: 0.002 });
});

test('tick labels are free of floating-point noise', () => {
  assert.deepEqual(generateTicks(0, 1).ticks.map((t) => t.label), [
    '0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1',
  ]);
  assert.deepEqual(generateTicks(-0.3, 0.3, 6).ticks.map((t) => t.value), [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]);
  assert.equal(formatTick(1.5e-5, -6), '1.5e-5');
  assert.equal(formatTick(4e6, 6), '4e6');
  assert.equal(formatTick(1.2e8, 7), '1.2e8');
  assert.equal(formatTick(-0.25, -2), '-0.25');
});

test('formatNumber gives short read-outs', () => {
  assert.equal(formatNumber(Math.PI), '3.14159');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(-2), '-2');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(1234567.89), '1.23457e6');
  assert.equal(formatNumber(1e-7), '1e-7');
  assert.equal(formatNumber(Math.SQRT2, 3), '1.41');
  assert.equal(formatNumber(NaN), '—');
  assert.equal(formatNumber(-Infinity), '-∞');
});

test('formatConstant writes multiples of pi and parses back', () => {
  const cases = [
    [Math.PI, 'pi'], [-Math.PI / 2, '-pi/2'], [(3 * Math.PI) / 4, '3pi/4'], [2 * Math.PI, '2pi'],
    [(2 * Math.PI) / 3, '2pi/3'], [-Math.PI / 6, '-pi/6'], [0, '0'], [1.5, '1.5'], [-0.25, '-0.25'],
    [Math.E, '2.718281828'], [1e-7, '1e-7'], [3.14, '3.14'],
  ];
  for (const [value, text] of cases) {
    assert.equal(formatConstant(value), text);
    const back = evaluateConstant(text);
    assert.ok(Math.abs(back - value) <= 1e-9 * Math.max(1, Math.abs(value)), `${text} reads back as ${back}`);
  }
});
