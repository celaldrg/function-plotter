/**
 * Entry point: connects the plotter state to the canvas, the side panel, pointer and keyboard
 * input, the header actions (share, PNG, reset, language) and persistence (URL hash + storage).
 */
import { createPlotter, createDemoState, decodeState } from './plotter.js';
import { containView, resizeView, panByPixels, panByFraction, zoomAt, toWorld } from './viewport.js';
import { drawScene } from './render.js';
import { samplingDetail } from './sampling.js';
import { attachGestures } from './gestures.js';
import { createPanel, functionName } from './panel.js';
import { setLanguage, getLanguage, t } from './i18n.js';
import { el, applyTranslations, insertIcons } from './dom.js';
import { FUNCTIONS } from './functions.js';
import { load, save } from './storage.js';

const ZOOM_STEP = 1.5;
const PAN_STEP = 0.1;
const PERSIST_DELAY_MS = 300;
const TRACE_RADIUS_PX = { mouse: 24, touch: 36 };
const TOAST_MS = { plain: 2500, action: 6000 };
const EXPORT_SCALE = 2;
/** In "?demo", a trace read-out on y₃ shows the feature in the screenshot. */
const DEMO_TRACE = { id: 3, x: 0.6 };

const $ = (id) => document.getElementById(id);
const canvas = $('plot');
const ctx = canvas.getContext('2d');
const hint = $('hint');
const demo = new URLSearchParams(window.location.search).has('demo');

let plotter = createPlotter(initialState());
let size = null; // canvas size in CSS pixels, known after the first resize
let trace = null; // snapped read-out point {id, color, x, y} in world units
let frame = 0;
let persistTimer = 0;
let toastTimer = 0;
let toastRun = null;

const panel = createPanel({
  plotter: () => plotter,
  changed() {
    trace = null;
    requestDraw();
    persist();
  },
});

/** "?demo" first, then a shared link, then the last session, then the default plot. */
function initialState() {
  if (demo) return createDemoState();
  return decodeState(window.location.hash) ?? decodeState(load('state') ?? '') ?? undefined;
}

const currentView = () => plotter.getState().view;

/* ---------- drawing ---------- */

function requestDraw() {
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }
}

/** The zoom buttons' box in canvas pixels, so labels are not drawn under them. */
function controlsBox() {
  const box = $('zoom-controls').getBoundingClientRect();
  const origin = canvas.getBoundingClientRect();
  return { x: box.left - origin.left - 4, y: box.top - origin.top - 4, w: box.width + 8, h: box.height + 8 };
}

/** The trace read-out with its label, or null when it is off screen or its curve is gone. */
function traceInView() {
  if (!trace) return null;
  const { xMin, xMax, yMin, yMax } = currentView();
  if (trace.x < xMin || trace.x > xMax || trace.y < yMin || trace.y > yMax) return null;
  const index = plotter.listFunctions().findIndex((f) => f.id === trace.id);
  return index < 0 ? null : { ...trace, name: functionName(index) };
}

function buildScene(extra) {
  const detail = samplingDetail(size.width);
  return {
    ...size,
    view: currentView(),
    curves: plotter.curves(currentView(), detail),
    markers: plotter.markers(),
    integral: plotter.integral(detail),
    words: { max: t('max'), min: t('min') },
    trace: null,
    legend: null,
    obstacles: [],
    ...extra,
  };
}

function draw() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (!size) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(size.width * dpr));
  const height = Math.max(1, Math.round(size.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(width / size.width, 0, 0, height / size.height, 0, 0);
  drawScene(ctx, buildScene({ trace: traceInView(), obstacles: [controlsBox()] }));
}

/** Keeps the scale when the canvas changes size; the first size fits the whole saved window. */
function resize(width, height) {
  if (width < 1 || height < 1) return;
  const view = currentView();
  plotter.setView(size ? resizeView(view, size.width, size.height, width, height) : containView(view, width, height));
  const first = !size;
  size = { width, height };
  if (first && demo) showDemoTrace();
  draw(); // now, not on the next frame: the resized canvas is blank until redrawn
}

function showDemoTrace() {
  const { columns, rows } = plotter.table(DEMO_TRACE.x, 1, 1);
  const column = columns.findIndex((c) => c.id === DEMO_TRACE.id);
  if (column >= 0) trace = { id: DEMO_TRACE.id, color: columns[column].color, x: DEMO_TRACE.x, y: rows[0].values[column] };
}

/* ---------- view and state changes ---------- */

function setView(view) {
  plotter.setView(view);
  requestDraw();
  persist();
}

function zoomBy(factor) {
  dismissHint();
  setView(zoomAt(currentView(), factor));
}

function resetView() {
  dismissHint();
  plotter.resetView();
  setView(containView(currentView(), size.width, size.height));
}

/** Replaces the whole state (reset, undo, a pasted link) and shows its window. */
function loadState(state) {
  plotter = createPlotter(state);
  trace = null;
  if (size) plotter.setView(containView(currentView(), size.width, size.height));
  panel.render();
  requestDraw();
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS);
}

/** Writes the state to the URL hash (dropping "?demo") and to storage. */
function persistNow() {
  clearTimeout(persistTimer);
  const hash = plotter.toHash();
  window.history.replaceState(null, '', `${window.location.pathname}#${hash}`);
  save('state', hash);
}

/* ---------- pointer and keyboard ---------- */

function traceAt(px, py, touch) {
  const view = currentView();
  const unitX = (view.xMax - view.xMin) / size.width;
  const unitY = (view.yMax - view.yMin) / size.height;
  const p = toWorld(view, px, py, size.width, size.height);
  const hit = plotter.trace(p.x, p.y, unitX, unitY, touch ? TRACE_RADIUS_PX.touch : TRACE_RADIUS_PX.mouse);
  trace = hit && { id: hit.id, color: hit.color, x: hit.x, y: hit.y };
  requestDraw();
}

/** Calls fn only once the canvas has a size. */
const sized =
  (fn) =>
  (...args) => {
    if (size) fn(...args);
  };

attachGestures(canvas, {
  pan: sized((dx, dy) => setView(panByPixels(currentView(), dx, dy, size.width, size.height))),
  zoom: sized((factor, px, py) => {
    const p = toWorld(currentView(), px, py, size.width, size.height);
    setView(zoomAt(currentView(), factor, p.x, p.y));
  }),
  trace: sized(traceAt),
  clearTrace() {
    if (!trace) return;
    trace = null;
    requestDraw();
  },
  interact: dismissHint,
});

const KEY_ACTIONS = {
  ArrowLeft: () => setView(panByFraction(currentView(), -PAN_STEP, 0)),
  ArrowRight: () => setView(panByFraction(currentView(), PAN_STEP, 0)),
  ArrowUp: () => setView(panByFraction(currentView(), 0, PAN_STEP)),
  ArrowDown: () => setView(panByFraction(currentView(), 0, -PAN_STEP)),
  '+': () => zoomBy(1 / ZOOM_STEP),
  '=': () => zoomBy(1 / ZOOM_STEP),
  '-': () => zoomBy(ZOOM_STEP),
  0: resetView,
};

const isTyping = (target) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
  const action = Object.hasOwn(KEY_ACTIONS, event.key) ? KEY_ACTIONS[event.key] : null;
  if (!action || !size) return;
  event.preventDefault();
  dismissHint();
  action();
});

$('zoom-in').addEventListener('click', sized(() => zoomBy(1 / ZOOM_STEP)));
$('zoom-out').addEventListener('click', sized(() => zoomBy(ZOOM_STEP)));
$('zoom-reset').addEventListener('click', sized(resetView));

/* ---------- hint and toast ---------- */

function dismissHint() {
  if (hint.hidden || hint.classList.contains('is-faded')) return;
  hint.classList.add('is-faded');
  save('hint', 'seen');
}

function hideToast() {
  $('toast').classList.remove('is-visible');
  toastRun = null;
}

/** Fills an element from a translation key and keeps the key, so a language switch re-translates it. */
function setTranslated(node, key) {
  node.dataset.i18n = key;
  node.textContent = t(key);
}

/**
 * Shows a short message, optionally with one action button (e.g. Undo).
 * @param {string} key translation key of the message
 * @param {{label: string, run: () => void}|null} [action] label is a translation key too
 */
function toast(key, action = null) {
  setTranslated($('toast-text'), key);
  $('toast-action').hidden = !action;
  if (action) setTranslated($('toast-action'), action.label);
  toastRun = action ? action.run : null;
  $('toast').classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? TOAST_MS.action : TOAST_MS.plain);
}

$('toast-action').addEventListener('click', () => {
  const run = toastRun;
  hideToast();
  if (run) run();
});

/* ---------- header actions ---------- */

async function share() {
  persistNow();
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast('linkCopied');
  } catch {
    toast('linkManual');
  }
}

/** Legend rows for the exported image: every drawn function, and its derivative when shown. */
function legendRows() {
  const { show } = plotter.getState();
  return plotter.listFunctions().flatMap((f, i) => {
    if (!f.visible || f.error) return [];
    const name = functionName(i);
    const rows = [{ color: f.color, text: `${name} = ${f.expr}`, dashed: false }];
    if (show.derivative) rows.push({ color: f.color, text: `${name}′ = ${f.derivativeText}`, dashed: true });
    return rows;
  });
}

function exportPng() {
  if (!size) return;
  const image = document.createElement('canvas');
  image.width = Math.round(size.width * EXPORT_SCALE);
  image.height = Math.round(size.height * EXPORT_SCALE);
  const context = image.getContext('2d');
  context.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
  drawScene(context, buildScene({ legend: legendRows() }));
  image.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'function-plot.png' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

function reset() {
  const before = plotter.getState();
  loadState();
  persist();
  toast('resetDone', {
    label: 'undo',
    run() {
      loadState(before);
      persist();
    },
  });
}

/** Translates the page (a visible toast included), the panel and the plot labels. */
function applyLanguage(lang) {
  setLanguage(lang);
  document.documentElement.lang = getLanguage();
  document.title = t('title');
  applyTranslations(t);
  $('lang').textContent = getLanguage() === 'en' ? 'TR' : 'EN';
  panel.render();
  requestDraw();
}

$('share').addEventListener('click', share);
$('png').addEventListener('click', exportPng);
$('reset').addEventListener('click', reset);
$('lang').addEventListener('click', () => {
  const next = getLanguage() === 'en' ? 'tr' : 'en';
  save('lang', next);
  applyLanguage(next);
});

/* ---------- start ---------- */

window.addEventListener('hashchange', () => {
  const state = decodeState(window.location.hash);
  if (state) loadState(state);
});

hint.dataset.i18n = window.matchMedia('(pointer: coarse)').matches ? 'hintTouch' : 'hintMouse';
hint.hidden = demo || load('hint') === 'seen';
$('syntax-functions').textContent = Object.keys(FUNCTIONS).join(', ');
insertIcons();
applyLanguage(load('lang') ?? 'en');
new ResizeObserver(([entry]) => resize(entry.contentRect.width, entry.contentRect.height)).observe(canvas);
