/**
 * Numerical analysis on a range: roots (sign-change bracketing + Brent), intersections,
 * local extrema (roots of the derivative), definite integrals (adaptive Simpson), value tables.
 */

const tidy = (value) => Number(value.toPrecision(12));
const signedTolerance = (tol, direction) => (direction >= 0 ? Math.abs(tol) : -Math.abs(tol));

/**
 * Brent's method: a root of f inside [a, b] where f(a) and f(b) have opposite signs.
 * @param {(x: number) => number} f
 * @param {number} a
 * @param {number} b
 * @param {{tolerance?: number, maxIterations?: number}} [options]
 * @returns {number} the root, or NaN when [a, b] is not a bracket
 */
export function brent(f, a, b, { tolerance = 1e-14, maxIterations = 200 } = {}) {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!(fa * fb < 0)) return NaN;
  let c = b;
  let fc = fb;
  let d = 0;
  let e = 0;
  for (let i = 0; i < maxIterations; i += 1) {
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      [a, b, c] = [b, c, b];
      [fa, fb, fc] = [fb, fc, fb];
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tolerance;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p;
      let q;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qa = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qa * (qa - r) - (b - a) * (r - 1));
        q = (qa - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d; // interpolation accepted
        d = p / q;
      } else {
        d = xm; // fall back to bisection
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : signedTolerance(tol1, xm);
    fb = f(b);
  }
  return b;
}

/** Grid scan: brackets with a strict sign change and isolated exact zeros. */
function scanSignChanges(f, a, b, samples) {
  const xs = [];
  const ys = [];
  for (let i = 0; i <= samples; i += 1) {
    xs.push(a + ((b - a) * i) / samples);
    ys.push(f(xs[i]));
  }
  const found = [];
  for (let i = 0; i <= samples; i += 1) {
    const left = i > 0 ? ys[i - 1] : NaN;
    const right = i < samples ? ys[i + 1] : NaN;
    if (ys[i] === 0) {
      if (left !== 0 && right !== 0) found.push({ x: xs[i], left, right });
    } else if (Number.isFinite(ys[i]) && Number.isFinite(right) && ys[i] * right < 0) {
      found.push({ lo: xs[i], hi: xs[i + 1], left: ys[i], right });
    }
  }
  return found;
}

/**
 * Roots of f in [a, b]. Sign changes at poles or jumps (tan(x), floor(x) - 0.5) are rejected.
 * @param {(x: number) => number} f
 * @param {number} a
 * @param {number} b
 * @param {{samples?: number, max?: number}} [options] grid size (default 400), result cap (default 100)
 * @returns {number[]} roots in ascending order
 */
export function findRoots(f, a, b, { samples = 400, max = 100 } = {}) {
  const roots = [];
  for (const hit of scanSignChanges(f, a, b, samples)) {
    if (roots.length >= max) break;
    if (hit.x !== undefined) {
      roots.push(hit.x);
      continue;
    }
    const root = brent(f, hit.lo, hit.hi);
    const scale = Math.max(Math.abs(hit.left), Math.abs(hit.right));
    if (Math.abs(f(root)) <= 1e-6 * scale) roots.push(root);
  }
  return roots;
}

/**
 * Points where f and g meet in [a, b].
 * @param {(x: number) => number} f
 * @param {(x: number) => number} g
 * @param {number} a
 * @param {number} b
 * @param {{samples?: number, max?: number}} [options]
 * @returns {{x: number, y: number}[]}
 */
export function findIntersections(f, g, a, b, options) {
  return findRoots((x) => f(x) - g(x), a, b, options).map((x) => ({ x, y: f(x) }));
}

/** Continuity test: the change around x must shrink when the probe distance shrinks. */
function isContinuousAt(f, x, h) {
  const y = f(x);
  const spread = (d) => Math.max(Math.abs(f(x - d) - y), Math.abs(f(x + d) - y));
  return spread(h / 256) <= 0.5 * spread(h) + 1e-9 * (1 + Math.abs(y));
}

/**
 * Local extrema of f in [a, b] from the sign changes of its derivative df.
 * Kinks such as abs(x) count; poles such as those of tan(x)^2 do not.
 * @param {(x: number) => number} f
 * @param {(x: number) => number} df derivative of f
 * @param {number} a
 * @param {number} b
 * @param {{samples?: number, max?: number}} [options]
 * @returns {{x: number, y: number, kind: 'min' | 'max'}[]}
 */
export function findExtrema(f, df, a, b, { samples = 400, max = 100 } = {}) {
  const extrema = [];
  const probe = Math.abs(b - a) * 1e-7;
  for (const hit of scanSignChanges(df, a, b, samples)) {
    if (extrema.length >= max) break;
    if (!(hit.left * hit.right < 0)) continue; // e.g. x^3 at 0: flat but not an extremum
    const x = hit.x ?? brent(df, hit.lo, hit.hi);
    const y = f(x);
    if (Number.isFinite(y) && isContinuousAt(f, x, probe)) {
      extrema.push({ x, y, kind: hit.left > 0 ? 'max' : 'min' });
    }
  }
  return extrema;
}

/** Largest unresolved error estimate, relative to the result, that integrate() still accepts. */
const UNRESOLVED_LIMIT = 1e-6;

function simpsonStep(f, a, b, fa, fm, fb, whole, tol, depth, budget) {
  const m = (a + b) / 2;
  const flm = f((a + m) / 2);
  const frm = f((m + b) / 2);
  budget.left -= 2;
  const left = ((m - a) / 6) * (fa + 4 * flm + fm);
  const right = ((b - m) / 6) * (fm + 4 * frm + fb);
  const delta = left + right - whole;
  if (Number.isNaN(delta)) return NaN;
  const converged = Math.abs(delta) <= 15 * tol;
  if (converged || depth <= 0 || budget.left <= 0) {
    if (!converged) budget.unresolved += Math.abs(delta) / 15; // error estimate left on the table
    return left + right + delta / 15;
  }
  return (
    simpsonStep(f, a, m, fa, flm, fm, left, tol / 2, depth - 1, budget) +
    simpsonStep(f, m, b, fm, frm, fb, right, tol / 2, depth - 1, budget)
  );
}

/**
 * Definite integral of f from a to b by adaptive Simpson with Richardson correction.
 * @param {(x: number) => number} f
 * @param {number} a lower bound (may exceed b; the sign flips)
 * @param {number} b upper bound
 * @param {{tolerance?: number, maxDepth?: number, maxEvaluations?: number}} [options]
 * @returns {number} the integral; NaN when f is undefined on the way or the result cannot be trusted
 *   because the subdivision limits were reached with a large error left (poles such as 1/x across 0)
 */
export function integrate(f, a, b, { tolerance = 1e-10, maxDepth = 40, maxEvaluations = 200000 } = {}) {
  if (a === b) return 0;
  const fa = f(a);
  const fm = f((a + b) / 2);
  const fb = f(b);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  const tol = Math.max(tolerance, Math.abs(whole) * 1e-13);
  const budget = { left: maxEvaluations, unresolved: 0 };
  const value = simpsonStep(f, a, b, fa, fm, fb, whole, tol, maxDepth, budget);
  const trusted = Number.isFinite(value) && budget.unresolved <= UNRESOLVED_LIMIT * Math.max(1, Math.abs(value));
  return trusted ? value : NaN;
}

/**
 * Table of values for several functions at start, start + step, ...
 * @param {((x: number) => number)[]} fns
 * @param {number} start first x
 * @param {number} step distance between rows
 * @param {number} count number of rows
 * @returns {{x: number, values: number[]}[]} x values free of floating-point noise
 */
export function valuesTable(fns, start, step, count) {
  return Array.from({ length: count }, (_, i) => {
    const x = tidy(start + i * step);
    return { x, values: fns.map((fn) => fn(x)) };
  });
}
