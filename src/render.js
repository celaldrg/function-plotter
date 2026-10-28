/**
 * Canvas drawing for the plot: grid, axes, tick labels, the shaded integral, curves, markers,
 * the trace read-out and the legend used in exported images. It draws into a 2D context whose
 * transform already maps CSS pixels and reads nothing from the page.
 */
import { generateTicks, formatNumber } from './ticks.js';

const THEME = Object.freeze({
  background: '#0f172a',
  minor: 'rgba(148, 163, 184, 0.07)',
  major: 'rgba(148, 163, 184, 0.17)',
  axis: '#848d9c', // opaque, so the integral's dashed bound does not show through
  label: '#94a3b8',
  text: '#e2e8f0',
  box: 'rgba(30, 41, 59, 0.94)',
  border: '#334155',
});
const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT = `12px ${FAMILY}`;
const STRONG_FONT = `600 12px ${FAMILY}`;
const TICK_SPACING_PX = 96;
const LABEL_HEIGHT = 18;
const MAX_MARKER_LABELS = 24;
const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const crisp = (v) => Math.round(v) + 0.5;
const typographic = (text) => text.replace(/-/g, '−');
const overlaps = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

/** "#38bdf8" with alpha 0.2 -> "rgba(56, 189, 248, 0.2)". */
function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** World to pixel functions; far-off points are pulled in so the canvas never sees huge numbers. */
function createMapper({ view, width, height }) {
  const sx = width / (view.xMax - view.xMin);
  const sy = height / (view.yMax - view.yMin);
  const limit = 10 * (width + height);
  return {
    px: (x) => clamp((x - view.xMin) * sx, -limit, width + limit),
    py: (y) => clamp((view.yMax - y) * sy, -limit, height + limit),
  };
}

/** Labels and other boxes already on the canvas; `place` finds a free spot for a new one. */
function createLayout(width, height, obstacles) {
  const taken = [...obstacles];
  const fits = (b) =>
    b.x >= 2 && b.y >= 2 && b.x + b.w <= width - 2 && b.y + b.h <= height - 2 && !taken.some((o) => overlaps(b, o));
  return {
    fits,
    reserve: (box) => taken.push(box),
    place(candidates) {
      const box = candidates.find(fits) ?? null;
      if (box) taken.push(box);
      return box;
    },
  };
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text with a halo in the background colour, readable over grid lines and curves. */
function haloText(ctx, text, x, y, color) {
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = THEME.background;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function minorValues(min, max, step) {
  const mantissa = Math.round(step / 10 ** Math.floor(Math.log10(step)));
  const parts = mantissa === 2 ? 4 : 5;
  const minor = step / parts;
  const values = [];
  for (let k = Math.ceil(min / minor); k <= Math.floor(max / minor); k += 1) {
    if (k % parts !== 0) values.push(k * minor);
  }
  return values;
}

function strokeGridLines(ctx, scene, map, xs, ys, color) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const x of xs) {
    const px = crisp(map.px(x));
    ctx.moveTo(px, 0);
    ctx.lineTo(px, scene.height);
  }
  for (const y of ys) {
    const py = crisp(map.py(y));
    ctx.moveTo(0, py);
    ctx.lineTo(scene.width, py);
  }
  ctx.stroke();
}

function drawGrid(ctx, scene, map, ticks) {
  const { view } = scene;
  ctx.lineWidth = 1;
  const minorX = minorValues(view.xMin, view.xMax, ticks.x.step);
  const minorY = minorValues(view.yMin, view.yMax, ticks.y.step);
  strokeGridLines(ctx, scene, map, minorX, minorY, THEME.minor);
  const majorX = ticks.x.ticks.filter((t) => t.value !== 0).map((t) => t.value);
  const majorY = ticks.y.ticks.filter((t) => t.value !== 0).map((t) => t.value);
  strokeGridLines(ctx, scene, map, majorX, majorY, THEME.major);
}

/** The axes go over the shaded integral so they stay visible through it. */
function drawAxes(ctx, scene, map) {
  const { view } = scene;
  const axisX = view.xMin <= 0 && view.xMax >= 0 ? [0] : [];
  const axisY = view.yMin <= 0 && view.yMax >= 0 ? [0] : [];
  ctx.lineWidth = 1.25;
  strokeGridLines(ctx, scene, map, axisX, axisY, THEME.axis);
}

/** x labels under the x axis (or along the nearest edge when the axis is off screen). */
function drawXLabels(ctx, scene, map, ticks, layout) {
  const axis = map.py(0);
  const below = axis + 5 + LABEL_HEIGHT <= scene.height;
  const top = below ? Math.max(4, axis + 5) : Math.min(scene.height - LABEL_HEIGHT - 4, axis - 5 - LABEL_HEIGHT);
  ctx.textAlign = 'center';
  for (const { value, label } of ticks.ticks) {
    if (value === 0) continue;
    const text = typographic(label);
    const width = ctx.measureText(text).width + 4;
    const box = { x: map.px(value) - width / 2, y: top, w: width, h: LABEL_HEIGHT };
    if (!layout.fits(box)) continue;
    layout.reserve(box);
    haloText(ctx, text, map.px(value), top + LABEL_HEIGHT / 2, THEME.label);
  }
}

/** y labels left of the y axis, or right of it / along an edge when there is no room. */
function drawYLabels(ctx, scene, map, ticks, layout) {
  const axis = map.px(0);
  const texts = ticks.ticks.map((t) => typographic(t.label));
  const widest = Math.max(0, ...texts.map((s) => ctx.measureText(s).width));
  const left = axis - 6 - widest >= 4;
  const anchor = left ? Math.min(axis - 6, scene.width - 6) : Math.max(axis + 6, 6);
  ctx.textAlign = left ? 'right' : 'left';
  ticks.ticks.forEach(({ value }, i) => {
    if (value === 0) return;
    const width = ctx.measureText(texts[i]).width + 4;
    const py = map.py(value);
    const box = { x: left ? anchor - width + 2 : anchor - 2, y: py - LABEL_HEIGHT / 2, w: width, h: LABEL_HEIGHT };
    if (!layout.fits(box)) return;
    layout.reserve(box);
    haloText(ctx, texts[i], anchor, py, THEME.label);
  });
}

function drawOriginLabel(ctx, scene, map, layout) {
  const { view } = scene;
  if (view.xMin > 0 || view.xMax < 0 || view.yMin > 0 || view.yMax < 0) return;
  const box = { x: map.px(0) - 16, y: map.py(0) + 4, w: 12, h: LABEL_HEIGHT };
  if (!layout.fits(box)) return;
  layout.reserve(box);
  ctx.textAlign = 'right';
  haloText(ctx, '0', map.px(0) - 5, map.py(0) + 4 + LABEL_HEIGHT / 2, THEME.label);
}

function drawTickLabels(ctx, scene, map, ticks, layout) {
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  drawOriginLabel(ctx, scene, map, layout);
  drawXLabels(ctx, scene, map, ticks.x, layout);
  drawYLabels(ctx, scene, map, ticks.y, layout);
}

function tracePath(ctx, segments, map) {
  ctx.beginPath();
  for (const segment of segments) {
    ctx.moveTo(map.px(segment[0].x), map.py(segment[0].y));
    for (let i = 1; i < segment.length; i += 1) ctx.lineTo(map.px(segment[i].x), map.py(segment[i].y));
  }
}

function drawIntegralArea(ctx, scene, map) {
  const area = scene.integral;
  if (!area) return;
  const base = map.py(0);
  // A diverging integral (1/x across 0) has no area to shade; only its bounds are drawn.
  if (Number.isFinite(area.value)) {
    ctx.beginPath();
    for (const segment of area.segments) {
      ctx.moveTo(map.px(segment[0].x), base);
      for (const p of segment) ctx.lineTo(map.px(p.x), map.py(p.y));
      ctx.lineTo(map.px(segment.at(-1).x), base);
      ctx.closePath();
    }
    ctx.fillStyle = withAlpha(area.color, 0.2);
    ctx.fill();
  }
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(area.color, 0.7);
  ctx.beginPath();
  for (const bound of [area.from, area.to]) {
    const px = crisp(map.px(bound));
    ctx.moveTo(px, 0);
    ctx.lineTo(px, scene.height);
  }
  ctx.stroke();
  ctx.restore();
}

/** "∫ = value" inside the shaded area, half-way between the axis and the curve. */
function drawIntegralLabel(ctx, scene, map, layout) {
  const area = scene.integral;
  const points = area ? area.segments.flat() : [];
  if (points.length === 0 || !Number.isFinite(area.value)) return;
  const midX = (points[0].x + points.at(-1).x) / 2;
  const mid = points.reduce((best, p) => (Math.abs(p.x - midX) < Math.abs(best.x - midX) ? p : best));
  ctx.font = STRONG_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = `∫ = ${typographic(formatNumber(area.value, 6))}`;
  const width = ctx.measureText(text).width + 8;
  const cx = map.px(mid.x);
  const cy = clamp((map.py(0) + map.py(mid.y)) / 2, LABEL_HEIGHT, scene.height - LABEL_HEIGHT);
  const box = layout.place(
    [cy, cy - 24, cy + 24].map((y) => ({ x: cx - width / 2, y: y - LABEL_HEIGHT / 2, w: width, h: LABEL_HEIGHT })),
  );
  if (box) haloText(ctx, text, cx, box.y + LABEL_HEIGHT / 2, area.color);
}

function drawCurves(ctx, scene, map) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const curve of scene.curves) {
    if (!curve.derivative) continue;
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = withAlpha(curve.color, 0.8);
    tracePath(ctx, curve.derivative, map);
    ctx.stroke();
    ctx.restore();
  }
  for (const curve of scene.curves) {
    tracePath(ctx, curve.segments, map);
    ctx.lineWidth = 7;
    ctx.strokeStyle = withAlpha(curve.color, 0.14);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = curve.color;
    ctx.stroke();
  }
}

/** Every marker with its pixel position, style and label text; off-screen ones are dropped. */
function collectMarkers(scene, map) {
  const { markers, words, view } = scene;
  const scale = Math.max(view.xMax - view.xMin, view.yMax - view.yMin) * 1e-9;
  const fmt = (v) => typographic(formatNumber(Math.abs(v) < scale ? 0 : v, 4));
  const point = (p) => `(${fmt(p.x)}, ${fmt(p.y)})`;
  const items = [
    ...markers.intersections.map((p) => ({ ...p, style: 'cross', color: THEME.text, text: point(p) })),
    ...markers.extrema.map((p) => ({ ...p, style: 'ring', text: `${words[p.kind]} ${point(p)}` })),
    ...markers.roots.map((p) => ({ ...p, style: 'dot', text: point(p) })),
  ];
  return items
    .map((m) => ({ ...m, px: map.px(m.x), py: map.py(m.y) }))
    .filter((m) => m.px >= -6 && m.px <= scene.width + 6 && m.py >= -6 && m.py <= scene.height + 6);
}

function drawMarkerDot(ctx, m) {
  ctx.beginPath();
  ctx.arc(m.px, m.py, m.style === 'ring' ? 5 : 4.5, 0, TAU);
  ctx.fillStyle = m.style === 'ring' ? THEME.background : m.color;
  ctx.fill();
  ctx.lineWidth = m.style === 'ring' ? 2.5 : 2;
  ctx.strokeStyle = m.style === 'ring' ? m.color : THEME.background;
  ctx.stroke();
}

function drawMarkers(ctx, scene, map, layout) {
  const items = collectMarkers(scene, map);
  for (const m of items) {
    drawMarkerDot(ctx, m);
    layout.reserve({ x: m.px - 6, y: m.py - 6, w: 12, h: 12 });
  }
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let labelled = 0;
  for (const m of items) {
    if (labelled >= MAX_MARKER_LABELS) break;
    const w = ctx.measureText(m.text).width + 6;
    const h = LABEL_HEIGHT;
    const box = layout.place([
      { x: m.px + 8, y: m.py - h - 4, w, h },
      { x: m.px - w - 8, y: m.py - h - 4, w, h },
      { x: m.px + 8, y: m.py + 4, w, h },
      { x: m.px - w - 8, y: m.py + 4, w, h },
    ]);
    if (!box) continue;
    haloText(ctx, m.text, box.x + 3, box.y + h / 2, m.color);
    labelled += 1;
  }
}

/**
 * Lays out the trace read-out before any label is placed, so labels can keep clear of its dot
 * and box (both are drawn last, on top of everything else).
 */
function placeTrace(ctx, scene, map) {
  const { trace } = scene;
  if (!trace) return null;
  const x = map.px(trace.x);
  const y = map.py(trace.y);
  const fmt = (v) => typographic(formatNumber(v, 5));
  const lines = [`x = ${fmt(trace.x)}`, `${trace.name} = ${fmt(trace.y)}`];
  ctx.font = STRONG_FONT;
  const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 34;
  const h = 46;
  const bx = x + 14 + w <= scene.width - 4 ? x + 14 : Math.max(4, x - 14 - w);
  const by = y - 14 - h >= 4 ? y - 14 - h : Math.min(scene.height - h - 4, y + 14);
  return { x, y, color: trace.color, lines, box: { x: bx, y: by, w, h }, dot: { x: x - 9, y: y - 9, w: 18, h: 18 } };
}

function drawTrace(ctx, scene, map, trace) {
  const { x, y, color } = trace;
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(color, 0.6);
  ctx.beginPath();
  ctx.moveTo(crisp(x), y);
  ctx.lineTo(crisp(x), clamp(map.py(0), 0, scene.height));
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = THEME.text;
  ctx.stroke();
  drawTraceBox(ctx, trace);
}

function drawTraceBox(ctx, { box, color, lines }) {
  roundedRect(ctx, box.x, box.y, box.w, box.h, 10);
  ctx.fillStyle = THEME.box;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = withAlpha(color, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(box.x + 14, box.y + 14, 4, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = STRONG_FONT;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(lines[0], box.x + 24, box.y + 14);
  ctx.fillText(lines[1], box.x + 24, box.y + 32);
}

/** Texts and box of the legend shown in exported images (top-left corner). */
function measureLegend(ctx, rows, width) {
  ctx.font = FONT;
  const texts = rows.map((r) => (r.text.length > 48 ? `${r.text.slice(0, 47)}…` : r.text));
  const w = Math.min(width - 24, Math.max(...texts.map((s) => ctx.measureText(s).width)) + 52);
  return { texts, box: { x: 12, y: 12, w, h: rows.length * 20 + 14 } };
}

function drawLegend(ctx, rows, { texts, box }) {
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  roundedRect(ctx, box.x, box.y, box.w, box.h, 10);
  ctx.fillStyle = THEME.box;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.border;
  ctx.stroke();
  rows.forEach((row, i) => {
    const y = box.y + 17 + i * 20;
    ctx.save();
    ctx.setLineDash(row.dashed ? [5, 3] : []);
    ctx.lineWidth = row.dashed ? 1.75 : 2.5;
    ctx.strokeStyle = row.color;
    ctx.beginPath();
    ctx.moveTo(box.x + 12, y);
    ctx.lineTo(box.x + 30, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = THEME.text;
    ctx.fillText(texts[i], box.x + 40, y);
  });
}

/**
 * Draws one frame.
 * @param {CanvasRenderingContext2D} ctx context whose transform maps CSS pixels
 * @param {object} scene
 * @param {number} scene.width canvas width in CSS pixels
 * @param {number} scene.height canvas height in CSS pixels
 * @param {{xMin: number, xMax: number, yMin: number, yMax: number}} scene.view visible window
 * @param {object[]} scene.curves from plotter.curves()
 * @param {{roots: object[], extrema: object[], intersections: object[]}} scene.markers from plotter.markers()
 * @param {object|null} scene.integral from plotter.integral()
 * @param {{x: number, y: number, color: string, name: string}|null} scene.trace snapped trace point
 * @param {{color: string, text: string, dashed: boolean}[]|null} scene.legend rows for exported images
 * @param {{max: string, min: string}} scene.words translated marker words
 * @param {{x: number, y: number, w: number, h: number}[]} scene.obstacles boxes labels must avoid
 */
export function drawScene(ctx, scene) {
  const map = createMapper(scene);
  const { view, width, height } = scene;
  const ticks = {
    x: generateTicks(view.xMin, view.xMax, Math.max(2, width / TICK_SPACING_PX)),
    y: generateTicks(view.yMin, view.yMax, Math.max(2, height / TICK_SPACING_PX)),
  };
  const legend = scene.legend?.length ? measureLegend(ctx, scene.legend, width) : null;
  const trace = placeTrace(ctx, scene, map);
  const obstacles = [...scene.obstacles];
  if (legend) obstacles.push(legend.box);
  if (trace) obstacles.push(trace.box, trace.dot);
  const layout = createLayout(width, height, obstacles);
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, scene, map, ticks);
  drawIntegralArea(ctx, scene, map);
  drawAxes(ctx, scene, map);
  drawCurves(ctx, scene, map);
  drawIntegralLabel(ctx, scene, map, layout);
  drawTickLabels(ctx, scene, map, ticks, layout);
  drawMarkers(ctx, scene, map, layout);
  if (trace) drawTrace(ctx, scene, map, trace);
  if (legend) drawLegend(ctx, scene.legend, legend);
}
