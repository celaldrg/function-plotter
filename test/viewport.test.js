import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VIEW, MIN_SPAN, MAX_SPAN, isValidView, normalizeView, toWorld,
  panByPixels, panByFraction, zoomAt, containView, resizeView,
} from '../src/viewport.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const VIEW = { xMin: -10, xMax: 10, yMin: -5, yMax: 5 };
/** World point to canvas pixels, the mapping the renderer draws with. */
const toScreen = (view, x, y, width, height) => ({
  px: ((x - view.xMin) / (view.xMax - view.xMin)) * width,
  py: ((view.yMax - y) / (view.yMax - view.yMin)) * height,
});

test('world and screen coordinates convert both ways', () => {
  assert.deepEqual(toScreen(VIEW, 0, 0, 800, 400), { px: 400, py: 200 });
  assert.deepEqual(toScreen(VIEW, -10, 5, 800, 400), { px: 0, py: 0 });
  assert.deepEqual(toWorld(VIEW, 800, 400, 800, 400), { x: 10, y: -5 });
  for (const [x, y] of [[1.25, -3.5], [-7, 4.75], [9.9, 0.01]]) {
    const { px, py } = toScreen(VIEW, x, y, 640, 360);
    const back = toWorld(VIEW, px, py, 640, 360);
    near(back.x, x);
    near(back.y, y);
  }
});

test('dragging moves the content with the pointer', () => {
  const moved = panByPixels(VIEW, 80, -40, 800, 400); // right and up by 2 units, 1 unit
  assert.deepEqual(moved, { xMin: -12, xMax: 8, yMin: -6, yMax: 4 });
  const keys = panByFraction(VIEW, 0.1, -0.1);
  assert.deepEqual(keys, { xMin: -8, xMax: 12, yMin: -6, yMax: 4 });
});

test('zooming keeps the anchor point fixed and respects the limits', () => {
  const zoomed = zoomAt(VIEW, 0.5, 4, 2);
  near(zoomed.xMax - zoomed.xMin, 10);
  near(zoomed.yMax - zoomed.yMin, 5);
  const before = toScreen(VIEW, 4, 2, 800, 400);
  const after = toScreen(zoomed, 4, 2, 800, 400);
  near(before.px, after.px);
  near(before.py, after.py);
  const centred = zoomAt(VIEW, 2);
  assert.deepEqual(centred, { xMin: -20, xMax: 20, yMin: -10, yMax: 10 });
  const tiny = zoomAt(VIEW, 1e-12);
  near(tiny.yMax - tiny.yMin, MIN_SPAN, 1e-15);
  const huge = zoomAt(VIEW, 1e12);
  near(huge.xMax - huge.xMin, MAX_SPAN, 1e-3);
  assert.ok(isValidView(tiny) && isValidView(huge));
});

test('invalid windows fall back to the default', () => {
  assert.equal(isValidView(VIEW), true);
  for (const bad of [null, {}, { ...VIEW, xMin: 11 }, { ...VIEW, yMax: NaN }, { ...VIEW, xMax: '5' }, { ...VIEW, xMin: -1e13 }]) {
    assert.equal(isValidView(bad), false);
    assert.deepEqual(normalizeView(bad), { ...DEFAULT_VIEW });
  }
  assert.deepEqual(normalizeView({ ...VIEW, extra: 1 }), VIEW);
});

test('containView shows the whole window with equal units, centred', () => {
  const wide = containView(VIEW, 400, 400); // 20 x 10 window on a square canvas
  assert.deepEqual(wide, { xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
  const tall = containView({ xMin: 0, xMax: 4, yMin: 0, yMax: 8 }, 800, 400);
  assert.deepEqual(tall, { xMin: -6, xMax: 10, yMin: 0, yMax: 8 });
  const a = toScreen(tall, 1, 1, 800, 400);
  const o = toScreen(tall, 0, 0, 800, 400);
  near(a.px - o.px, o.py - a.py);
  const limited = containView({ xMin: -5e7, xMax: 5e7, yMin: -1, yMax: 1 }, 100, 1000);
  assert.ok(isValidView(limited), 'scaled back into the span limits');
  near(limited.yMax - limited.yMin, MAX_SPAN, 1e-3);
});

test('resizeView keeps the centre and the scale, and resizing back restores the window', () => {
  const bigger = resizeView(VIEW, 800, 400, 1200, 400);
  assert.deepEqual(bigger, { xMin: -15, xMax: 15, yMin: -5, yMax: 5 });
  const back = resizeView(bigger, 1200, 400, 800, 400);
  for (const key of Object.keys(VIEW)) near(back[key], VIEW[key]);
  const shifted = resizeView({ xMin: 2, xMax: 4, yMin: 1, yMax: 2 }, 200, 100, 100, 200);
  assert.deepEqual(shifted, { xMin: 2.5, xMax: 3.5, yMin: 0.5, yMax: 2.5 });
  const tiny = resizeView({ xMin: 0, xMax: MIN_SPAN, yMin: 0, yMax: MIN_SPAN }, 100, 100, 10, 100);
  assert.ok(isValidView(tiny), 'never smaller than MIN_SPAN');
});
