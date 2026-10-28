/**
 * The visible window {xMin, xMax, yMin, yMax}: validation, panning, zooming, fitting it to the
 * canvas, and screen pixels to world coordinates. All functions return new objects.
 */

/** Initial window before it is fitted to the canvas aspect ratio. */
export const DEFAULT_VIEW = Object.freeze({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 });
/** Smallest allowed window width or height (deep zoom stops here, before rounding shows). */
export const MIN_SPAN = 1e-6;
/** Largest allowed window width or height (zooming out stops here). */
export const MAX_SPAN = 1e8;

const LIMIT = 1e12;
const spanOk = (span) => span >= MIN_SPAN * 0.999 && span <= MAX_SPAN * 1.001;

/**
 * @param {object} view candidate window
 * @returns {boolean} true when all bounds are finite, ordered and within the span limits
 */
export function isValidView(view) {
  if (!view || typeof view !== 'object') return false;
  const { xMin, xMax, yMin, yMax } = view;
  const bounds = [xMin, xMax, yMin, yMax];
  if (!bounds.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMIT)) return false;
  return spanOk(xMax - xMin) && spanOk(yMax - yMin);
}

/**
 * @param {object} view candidate window
 * @returns {{xMin: number, xMax: number, yMin: number, yMax: number}} a copy, or the default when invalid
 */
export function normalizeView(view) {
  const { xMin, xMax, yMin, yMax } = isValidView(view) ? view : DEFAULT_VIEW;
  return { xMin, xMax, yMin, yMax };
}

/**
 * Canvas pixels to world point (y grows downwards on screen, upwards in the world).
 * @param {object} view @param {number} px @param {number} py @param {number} width @param {number} height
 * @returns {{x: number, y: number}}
 */
export function toWorld(view, px, py, width, height) {
  return {
    x: view.xMin + (px / width) * (view.xMax - view.xMin),
    y: view.yMax - (py / height) * (view.yMax - view.yMin),
  };
}

/**
 * Moves the window by a fraction of its size (arrow keys: 0.1 = a tenth of the width).
 * @param {object} view @param {number} fx rightwards fraction @param {number} fy upwards fraction
 * @returns {object} new window
 */
export function panByFraction(view, fx, fy) {
  const dx = (view.xMax - view.xMin) * fx;
  const dy = (view.yMax - view.yMin) * fy;
  return { xMin: view.xMin + dx, xMax: view.xMax + dx, yMin: view.yMin + dy, yMax: view.yMax + dy };
}

/**
 * Drag: the content follows the pointer by (dx, dy) pixels.
 * @param {object} view @param {number} dx @param {number} dy @param {number} width @param {number} height
 * @returns {object} new window
 */
export function panByPixels(view, dx, dy, width, height) {
  return panByFraction(view, -dx / width, dy / height);
}

/**
 * Zooms around a world point that stays fixed on screen. factor < 1 zooms in.
 * The factor is limited so the window stays between MIN_SPAN and MAX_SPAN.
 * @param {object} view
 * @param {number} factor new size / old size
 * @param {number} [x] anchor x (default: centre)
 * @param {number} [y] anchor y (default: centre)
 * @returns {object} new window
 */
export function zoomAt(view, factor, x = (view.xMin + view.xMax) / 2, y = (view.yMin + view.yMax) / 2) {
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  const f = Math.min(Math.max(factor, MIN_SPAN / Math.min(spanX, spanY)), MAX_SPAN / Math.max(spanX, spanY));
  return {
    xMin: x - (x - view.xMin) * f,
    xMax: x + (view.xMax - x) * f,
    yMin: y - (y - view.yMin) * f,
    yMax: y + (view.yMax - y) * f,
  };
}

/** A window of the given spans around the centre of `view`, scaled into the span limits. */
function around(view, spanX, spanY) {
  const shrink = Math.min(1, MAX_SPAN / Math.max(spanX, spanY));
  const k = shrink * Math.max(1, MIN_SPAN / (Math.min(spanX, spanY) * shrink));
  const cx = (view.xMin + view.xMax) / 2;
  const cy = (view.yMin + view.yMax) / 2;
  const hx = (spanX * k) / 2;
  const hy = (spanY * k) / 2;
  return { xMin: cx - hx, xMax: cx + hx, yMin: cy - hy, yMax: cy + hy };
}

/**
 * The smallest window around the centre of `view` that contains all of it and has equal units
 * on both axes for a canvas of the given size (used to show a saved or shared window).
 * @param {object} view @param {number} width @param {number} height
 * @returns {object} new window, within the span limits
 */
export function containView(view, width, height) {
  const unit = Math.max((view.xMax - view.xMin) / width, (view.yMax - view.yMin) / height);
  return around(view, unit * width, unit * height);
}

/**
 * Keeps the centre and the scale (units per pixel) when the canvas changes size, so resizing
 * back and forth returns to the same window.
 * @param {object} view
 * @param {number} oldWidth @param {number} oldHeight previous canvas size
 * @param {number} width @param {number} height new canvas size
 * @returns {object} new window, within the span limits
 */
export function resizeView(view, oldWidth, oldHeight, width, height) {
  return around(view, ((view.xMax - view.xMin) * width) / oldWidth, ((view.yMax - view.yMin) * height) / oldHeight);
}
