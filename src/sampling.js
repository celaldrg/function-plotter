/**
 * Adaptive sampling of y = f(x) into polyline segments.
 * Intervals are subdivided where the curve bends; the line is split at poles, jumps
 * (tan(x), 1/x, floor(x)) and where the function is undefined, so no line crosses a gap.
 */

const MAX_JUMP_STEPS = 64;
/** Irrational probe positions: a curve that repeats inside an interval cannot line up with both. */
const PROBES = [(3 - Math.sqrt(5)) / 2, (Math.sqrt(5) - 1) / 2];

function needsRefinement(y0, ym, y1, tolerance) {
  const finite = [y0, ym, y1].filter(Number.isFinite).length;
  if (finite === 0) return false;
  if (finite < 3) return true; // a domain edge: home in on it
  return Math.abs(ym - (y0 + y1) / 2) > tolerance;
}

/** True when all three values lie beyond the same edge of the visible band (no visible detail to refine). */
function isOffscreen(values, yMin, yMax) {
  return values.every((y) => y > yMax) || values.every((y) => y < yMin);
}

/**
 * Decides whether a narrow interval hides a jump: keeps halving towards the larger change.
 * A continuous (even very steep) curve settles below the tolerance; a pole or step does not.
 * @param {(x: number) => number} f
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} tolerance y distance considered continuous
 * @returns {boolean}
 */
export function hasJump(f, x0, y0, x1, y1, tolerance) {
  for (let step = 0; step < MAX_JUMP_STEPS; step += 1) {
    if (Math.abs(y1 - y0) <= tolerance) return false;
    const xm = (x0 + x1) / 2;
    if (xm <= x0 || xm >= x1) return true; // out of floating-point resolution, still apart
    const ym = f(xm);
    if (!Number.isFinite(ym)) return true;
    if (Math.abs(ym - y0) >= Math.abs(y1 - ym)) {
      x1 = xm;
      y1 = ym;
    } else {
      x0 = xm;
      y0 = ym;
    }
  }
  return true;
}

/**
 * Grid for a plot `width` CSS pixels wide: two starting intervals per pixel, so a curve that
 * oscillates about once per pixel is not aliased into a flat line. The subdivision depth drops
 * as the grid grows, which keeps the finest step (and the worst-case cost) near 200 x 2^10.
 * @param {number} width plot width in CSS pixels
 * @returns {{samples: number, maxDepth: number}} sampleFunction options
 */
export function samplingDetail(width) {
  const samples = Math.max(200, Math.ceil(2 * width));
  return { samples, maxDepth: Math.max(0, 10 - Math.round(Math.log2(samples / 200))) };
}

/**
 * Samples f over [xMin, xMax] into continuous segments of points.
 * @param {(x: number) => number} f function of x
 * @param {number} xMin left end
 * @param {number} xMax right end
 * @param {{samples?: number, maxDepth?: number, tolerance?: number, yMin?: number, yMax?: number}} [options]
 *   samples: initial uniform intervals (default 200); maxDepth: subdivision levels (default 10);
 *   tolerance: allowed y deviation from a straight chord, about one pixel in world units;
 *   yMin/yMax: visible band - parts entirely above or below it are not refined
 * @returns {{x: number, y: number}[][]} segments, each sorted by x, all y finite
 */
export function sampleFunction(f, xMin, xMax, options = {}) {
  const samples = Math.max(1, Math.round(options.samples ?? 200));
  const maxDepth = options.maxDepth ?? 10;
  const tolerance = options.tolerance ?? (xMax - xMin) / 1000;
  const { yMin = -Infinity, yMax = Infinity } = options;
  const segments = [];
  let current = [];

  const breakLine = () => {
    if (current.length > 0) segments.push(current);
    current = [];
  };
  const emit = (x, y) => {
    if (Number.isFinite(y)) current.push({ x, y });
    else breakLine();
  };
  // A wide interval can hold several teeth of a sawtooth (mod(10x, 1)) whose ends and midpoint
  // all lie on one chord; two off-centre probes catch the teeth the midpoint test misses.
  const offChord = (x0, y0, x1, y1) =>
    PROBES.some((t) => {
      const y = f(x0 + t * (x1 - x0));
      return !Number.isFinite(y) || Math.abs(y - (y0 + t * (y1 - y0))) > tolerance;
    });
  const jumps = (x0, y0, x1, y1) =>
    Number.isFinite(y0) && Number.isFinite(y1) && hasJump(f, x0, y0, x1, y1, tolerance);
  const refine = (x0, y0, x1, y1, depth) => {
    if (depth >= maxDepth) {
      if (jumps(x0, y0, x1, y1)) breakLine();
      return;
    }
    const xm = (x0 + x1) / 2;
    const ym = f(xm);
    if (isOffscreen([y0, ym, y1], yMin, yMax)) return;
    // A midpoint on the chord can still hide a jump on each side of it: floor(10x) steps from 1
    // to 3 over [0.2, 0.3] with f(0.25) = 2. A chord is kept only when no jump hides under it.
    if (!needsRefinement(y0, ym, y1, tolerance) && !offChord(x0, y0, x1, y1) && !jumps(x0, y0, x1, y1)) return;
    refine(x0, y0, xm, ym, depth + 1);
    emit(xm, ym);
    refine(xm, ym, x1, y1, depth + 1);
  };

  let x0 = xMin;
  let y0 = f(x0);
  emit(x0, y0);
  for (let i = 1; i <= samples; i += 1) {
    const x1 = xMin + ((xMax - xMin) * i) / samples;
    const y1 = f(x1);
    refine(x0, y0, x1, y1, 0);
    emit(x1, y1);
    x0 = x1;
    y0 = y1;
  }
  breakLine();
  return segments;
}
