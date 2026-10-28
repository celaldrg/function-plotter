import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { compile } from '../src/compile.js';
import { sampleFunction, hasJump, samplingDetail } from '../src/sampling.js';

const fn = (text) => compile(parse(text));
const TOL = 0.01;

function assertWellFormed(segments) {
  for (const segment of segments) {
    assert.ok(segment.length > 0);
    for (let i = 0; i < segment.length; i += 1) {
      assert.ok(Number.isFinite(segment[i].y));
      if (i > 0) assert.ok(segment[i].x > segment[i - 1].x, 'points ascend in x');
    }
  }
}

test('tan(x) over [-5, 5] splits into separate segments, none crossing an asymptote', () => {
  const segments = sampleFunction(Math.tan, -5, 5, { tolerance: TOL });
  assertWellFormed(segments);
  assert.equal(segments.length, 5); // asymptotes at -3pi/2, -pi/2, pi/2, 3pi/2
  const asymptotes = [-1.5, -0.5, 0.5, 1.5].map((k) => k * Math.PI);
  segments.forEach((segment, i) => {
    const side = Math.sign(Math.cos(segment[0].x));
    for (const p of segment) assert.equal(Math.sign(Math.cos(p.x)), side, `segment ${i} crosses an asymptote at x=${p.x}`);
    if (i > 0) assert.ok(segment[0].x > asymptotes[i - 1] && segment[0].x - asymptotes[i - 1] < 1e-3);
    if (i < 4) assert.ok(segment.at(-1).x < asymptotes[i] && asymptotes[i] - segment.at(-1).x < 1e-3);
  });
  for (let i = 0; i < 4; i += 1) {
    assert.ok(segments[i].at(-1).y > 100, 'climbs towards +infinity before the asymptote');
    assert.ok(segments[i + 1][0].y < -100, 'comes back from -infinity after it');
  }
});

test('1/x splits at the pole, floor(x) at every jump', () => {
  const hyperbola = sampleFunction(fn('1/x'), -5, 5, { tolerance: TOL });
  assertWellFormed(hyperbola);
  assert.equal(hyperbola.length, 2);
  assert.ok(hyperbola[0].every((p) => p.x < 0) && hyperbola[1].every((p) => p.x > 0));
  const steps = sampleFunction(fn('floor(x)'), -3.5, 3.5, { tolerance: TOL });
  assertWellFormed(steps);
  assert.equal(steps.length, 8);
  steps.forEach((segment, i) => assert.ok(segment.every((p) => p.y === i - 4), 'each segment is one flat step'));
});

test('dense steps: no chord across jumps, even when the midpoint lies on it', () => {
  // Over [-10, 10] the samples x = 0.1999... and 0.3000... give floor(10x) = 1 and 3, and
  // f(0.25) = 2 lies exactly on the chord between them; zoomed out, a chord can span more jumps.
  const cases = [['floor(10x)', 10], ['floor(10x)', 33.75], ['floor(10x)', 75.9], ['floor(x^2)', 22.5], ['floor(x^2)', 50.6],
    ['round(10x)', 15], ['ceil(5x)', 51], ['floor(100x)', 5]];
  for (const [text, half] of cases) {
    const segments = sampleFunction(fn(text), -half, half);
    assertWellFormed(segments);
    for (const segment of segments) {
      const jump = segment.find((p) => p.y !== segment[0].y);
      assert.equal(jump, undefined, `${text} over ±${half}: a line crosses a jump at x=${jump?.x}`);
    }
  }
});

test('sawtooth teeth: no chord spans a jump, even when one interval holds several teeth', () => {
  // [expression, tooth index of x, tooth width at x, half-width of the window]. Zoomed out with the
  // default 200 starting intervals, one interval can hold several teeth whose ends and midpoint all
  // lie on one chord. Teeth narrower than 1.5 px (pixel = window / 1000) fill their band anyway.
  const cases = [
    ['mod(10x, 1)', (x) => Math.floor(10 * x), () => 0.1, 22.5],
    ['mod(10x, 1)', (x) => Math.floor(10 * x), () => 0.1, 30],
    ['tan(10x)', (x) => Math.round((10 * x) / Math.PI) + 0, () => Math.PI / 10, 76],
    ['mod(3x, 2)', (x) => Math.floor((3 * x) / 2), () => 2 / 3, 110],
    ['mod(x^2, 1)', (x) => Math.sign(x) * Math.floor(x * x) + 0, (x) => 1 / (2 * Math.abs(x)), 20.5],
    ['mod(x^2, 1)', (x) => Math.sign(x) * Math.floor(x * x) + 0, (x) => 1 / (2 * Math.abs(x)), 40.6],
  ];
  for (const [text, tooth, width, half] of cases) {
    const [yMin, yMax] = [-0.6 * half, 0.6 * half];
    const pixel = (2 * half) / 1000;
    for (const options of [{ yMin, yMax }, { yMin, yMax, ...samplingDetail(1000) }]) {
      for (const segment of sampleFunction(fn(text), -half, half, options)) {
        for (let i = 1; i < segment.length; i += 1) {
          const [a, b] = [segment[i - 1], segment[i]];
          const hidden = (a.y > yMax && b.y > yMax) || (a.y < yMin && b.y < yMin);
          if (hidden || width((a.x + b.x) / 2) < 1.5 * pixel) continue;
          assert.equal(tooth(a.x), tooth(b.x), `${text} over ±${half}: a chord spans a jump at x=${a.x}..${b.x}`);
        }
      }
    }
  }
});

test('smooth curves stay in one segment and follow the curve within the tolerance', () => {
  const f = fn('sin(3x) + x/4');
  const segments = sampleFunction(f, -10, 10, { tolerance: TOL });
  assert.equal(segments.length, 1);
  const points = segments[0];
  assert.equal(points[0].x, -10);
  assert.equal(points.at(-1).x, 10);
  for (let i = 1; i < points.length; i += 1) {
    const mid = (points[i - 1].x + points[i].x) / 2;
    const chord = (points[i - 1].y + points[i].y) / 2;
    assert.ok(Math.abs(f(mid) - chord) <= TOL * 1.0001, `deviation at ${mid}`);
  }
});

test('subdivision adds points where the curve bends and few where it is straight', () => {
  const line = sampleFunction(fn('2x + 1'), -10, 10, { tolerance: TOL, samples: 50 })[0];
  assert.equal(line.length, 51);
  const wave = sampleFunction(fn('sin(5x)'), -10, 10, { tolerance: TOL, samples: 50 })[0];
  assert.ok(wave.length > 300, `${wave.length} points`);
});

test('domain edges: the curve stops close to where it becomes undefined', () => {
  const root = sampleFunction(Math.sqrt, -4, 4, { tolerance: TOL });
  assert.equal(root.length, 1);
  assert.ok(root[0][0].x >= 0 && root[0][0].x < 1e-3);
  const log = sampleFunction(Math.log, -1, 1, { tolerance: TOL });
  assert.equal(log.length, 1);
  assert.ok(log[0][0].x > 0 && log[0][0].x < 1e-3);
  assert.deepEqual(sampleFunction(fn('sqrt(-1 - x^2)'), -3, 3), []);
});

test('hasJump tells steep continuous curves from real jumps', () => {
  const steep = (x) => Math.atan(1000 * x);
  assert.equal(hasJump(steep, -0.001, steep(-0.001), 0.001, steep(0.001), TOL), false);
  assert.equal(hasJump(Math.sign, -0.001, -1, 0.001, 1, TOL), true);
  assert.equal(hasJump(Math.tan, 1.57, Math.tan(1.57), 1.5716, Math.tan(1.5716), TOL), true);
});

test('parts beyond the visible band are not refined, visible parts still are', () => {
  const f = fn('x^x');
  const full = sampleFunction(f, 0.1, 10, { tolerance: TOL });
  const banded = sampleFunction(f, 0.1, 10, { tolerance: TOL, yMin: -6, yMax: 6 });
  const count = (segments) => segments.reduce((n, s) => n + s.length, 0);
  assert.ok(count(banded) * 10 < count(full), `${count(banded)} vs ${count(full)} points`);
  const points = banded[0];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].y > 6) break;
    const mid = (points[i - 1].x + points[i].x) / 2;
    assert.ok(Math.abs(f(mid) - (points[i - 1].y + points[i].y) / 2) <= TOL * 1.0001);
  }
  const tan = sampleFunction(Math.tan, -5, 5, { tolerance: TOL, yMin: -6, yMax: 6 });
  assert.equal(tan.length, 5, 'asymptotes still split the line');
});

test('sampling is deterministic', () => {
  const f = fn('x*sin(1/x)');
  assert.deepEqual(sampleFunction(f, -1, 1, { tolerance: TOL }), sampleFunction(f, -1, 1, { tolerance: TOL }));
});

test('samplingDetail: two samples per pixel, finest step kept near 200 x 2^10 intervals', () => {
  assert.deepEqual(samplingDetail(812), { samples: 1624, maxDepth: 7 });
  assert.deepEqual(samplingDetail(375), { samples: 750, maxDepth: 8 });
  assert.deepEqual(samplingDetail(1200), { samples: 2400, maxDepth: 6 });
  assert.deepEqual(samplingDetail(50), { samples: 200, maxDepth: 10 });
});

test('fast oscillations zoomed far out fill every pixel column instead of aliasing', () => {
  // sin(50x) over [-50, 50] on an 812 x 700 px plot of y in [-30, 30]: about one period per pixel.
  const width = 812;
  const [xMin, xMax, yMin, yMax] = [-50, 50, -30, 30];
  const segments = sampleFunction((x) => Math.sin(50 * x), xMin, xMax, { yMin, yMax, ...samplingDetail(width) });
  const columns = Array.from({ length: width }, () => ({ lo: Infinity, hi: -Infinity }));
  const columnOf = (x) => Math.min(width - 1, Math.max(0, Math.floor(((x - xMin) / (xMax - xMin)) * width)));
  for (const segment of segments) {
    for (let i = 0; i + 1 < segment.length; i += 1) {
      const [a, b] = [segment[i], segment[i + 1]];
      const yAt = (x) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      for (let c = columnOf(a.x); c <= columnOf(b.x); c += 1) {
        const left = Math.max(a.x, xMin + (c / width) * (xMax - xMin));
        const right = Math.min(b.x, xMin + ((c + 1) / width) * (xMax - xMin));
        if (left > right) continue;
        columns[c].lo = Math.min(columns[c].lo, yAt(left), yAt(right));
        columns[c].hi = Math.max(columns[c].hi, yAt(left), yAt(right));
      }
    }
  }
  const sixPixels = (6 * (yMax - yMin)) / 700;
  const short = columns.filter((col) => col.lo > -1 + sixPixels || col.hi < 1 - sixPixels).length;
  assert.equal(short, 0, `${short} of ${width} columns miss part of the [-1, 1] band`);
});
