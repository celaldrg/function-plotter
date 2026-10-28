/**
 * Plotter state (functions, parameters, toggles, integral tool, view) and everything the UI
 * derives from it: curves, markers, integral, table, trace, and the URL-hash codec.
 * Pure module: no DOM. The UI calls the methods and redraws from their results.
 */
import { parse } from './parser.js';
import { ParseError, MAX_EXPRESSION_LENGTH } from './tokenizer.js';
import { compile } from './compile.js';
import { derivative } from './derivative.js';
import { collectNames, dependsOn, toText } from './ast.js';
import { PARAMS, DEFAULT_PARAMS } from './functions.js';
import { sampleFunction } from './sampling.js';
import { findRoots, findExtrema, findIntersections, integrate, valuesTable } from './analysis.js';
import { DEFAULT_VIEW, isValidView, normalizeView } from './viewport.js';

/** Most functions on the list at once. */
export const MAX_FUNCTIONS = 6;
/** Curve colours, in the order new functions receive them. */
export const COLORS = Object.freeze(['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf']);
/** Slider range for a, b and c. */
export const PARAM_RANGE = Object.freeze({ min: -5, max: 5, step: 0.1 });
/** Overlay toggles; their first letters are used in the URL hash. */
export const TOGGLES = Object.freeze(['derivative', 'roots', 'extrema', 'intersections']);

const MARKER_CAP = 60;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const clampParam = (v) => Math.min(PARAM_RANGE.max, Math.max(PARAM_RANGE.min, v));
const cleanText = (text) => String(text ?? '').slice(0, MAX_EXPRESSION_LENGTH);
const toNumber = (text) => (text === null || text === undefined || text.trim() === '' ? NaN : Number(text));

function defaultState() {
  return {
    functions: [{ id: 1, expr: 'sin(x)', color: COLORS[0], visible: true }],
    params: { ...DEFAULT_PARAMS },
    show: Object.fromEntries(TOGGLES.map((t) => [t, false])),
    integral: { enabled: false, id: 1, from: 0, to: 1 },
    view: { ...DEFAULT_VIEW },
  };
}

function normalizeFunctions(list) {
  const items = list.slice(0, MAX_FUNCTIONS);
  const ids = items.map((f) => f?.id);
  const idsOk = ids.every((id) => Number.isInteger(id) && id > 0) && new Set(ids).size === ids.length;
  return items.map((f, i) => ({
    id: idsOk ? f.id : i + 1,
    expr: cleanText(f?.expr),
    color: COLORS.includes(f?.color) ? f.color : COLORS[i],
    visible: f?.visible !== false,
  }));
}

function normalizeIntegral(raw, functions) {
  const target = functions.find((f) => f.id === raw?.id) ?? functions[0];
  return {
    enabled: raw?.enabled === true && Boolean(target),
    id: target ? target.id : null,
    from: isFiniteNumber(raw?.from) ? raw.from : 0,
    to: isFiniteNumber(raw?.to) ? raw.to : 1,
  };
}

/**
 * Validates and completes a partial or untrusted state (from a URL hash, for example).
 * @param {object} [raw]
 * @returns {object} a complete state: {functions, params, show, integral, view}
 */
export function normalizeState(raw = {}) {
  const functions = Array.isArray(raw.functions) ? normalizeFunctions(raw.functions) : defaultState().functions;
  return {
    functions,
    params: Object.fromEntries(
      PARAMS.map((p) => [p, isFiniteNumber(raw.params?.[p]) ? clampParam(raw.params[p]) : DEFAULT_PARAMS[p]]),
    ),
    show: Object.fromEntries(TOGGLES.map((t) => [t, raw.show?.[t] === true])),
    integral: normalizeIntegral(raw.integral, functions),
    view: normalizeView(raw.view),
  };
}

/**
 * Compiles f and f'. The derivative is NaN wherever f is undefined: the simplifier turns the
 * derivative of sqrt(x) - sqrt(x), ln(x)*0 or floor(sqrt(x)) into 0, which alone is defined everywhere.
 */
function compilePair(tree, dTree, params) {
  const fn = compile(tree, params);
  const dRaw = compile(dTree, params);
  return { fn, dfn: (x) => (Number.isFinite(fn(x)) ? dRaw(x) : NaN) };
}

function analyze(expr, params) {
  try {
    const tree = parse(expr);
    const dTree = derivative(tree);
    const names = collectNames(tree);
    return {
      error: null,
      params: PARAMS.filter((p) => names.has(p)),
      tree,
      dTree,
      ...compilePair(tree, dTree, params),
      derivativeText: toText(dTree),
    };
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    const { code, pos, detail, message } = error;
    return { error: { code, pos, detail, message }, params: [], tree: null, fn: null, dfn: null, derivativeText: '' };
  }
}

/**
 * Creates a plotter. All methods are synchronous; read results after each call.
 * @param {object} [initial] state to start from (validated with normalizeState)
 * @returns {object} the plotter API; each method is documented below
 */
export function createPlotter(initial = {}) {
  const state = normalizeState(initial);
  const entries = new Map();
  const refresh = (f) => entries.set(f.id, analyze(f.expr, state.params));
  const recompile = (f) => {
    const entry = entries.get(f.id);
    if (entry.tree) Object.assign(entry, compilePair(entry.tree, entry.dTree, state.params));
  };
  const byId = (id) => state.functions.find((f) => f.id === id);
  let lastIntegral = { fn: null, from: NaN, to: NaN, value: NaN }; // the value does not depend on the view
  const integralValue = (fn, from, to) => {
    if (lastIntegral.fn !== fn || lastIntegral.from !== from || lastIntegral.to !== to) {
      lastIntegral = { fn, from, to, value: integrate(fn, from, to) };
    }
    return lastIntegral.value;
  };
  const active = () =>
    state.functions.filter((f) => f.visible && entries.get(f.id).fn).map((f) => ({ f, entry: entries.get(f.id) }));
  state.functions.forEach(refresh);

  return {
    /** @returns {object} a deep copy of the state */
    getState: () => structuredClone(state),
    /** @returns {object[]} functions with their parse error, used parameters and derivative text */
    listFunctions: () =>
      state.functions.map((f) => {
        const { error, params, derivativeText } = entries.get(f.id);
        return { ...f, error, params, derivativeText };
      }),
    /** @param {string} [expr] @returns {number|null} new id, or null when the list is full */
    addFunction(expr = '') {
      if (state.functions.length >= MAX_FUNCTIONS) return null;
      const id = Math.max(0, ...state.functions.map((f) => f.id)) + 1;
      const used = new Set(state.functions.map((f) => f.color));
      const f = { id, expr: cleanText(expr), color: COLORS.find((c) => !used.has(c)) ?? COLORS[0], visible: true };
      state.functions.push(f);
      refresh(f);
      if (state.integral.id === null) state.integral.id = id;
      return id;
    },
    /** @param {number} id */
    removeFunction(id) {
      state.functions = state.functions.filter((f) => f.id !== id);
      entries.delete(id);
      state.integral = normalizeIntegral(state.integral, state.functions);
    },
    /** @param {number} id @param {string} expr @returns {object|null} the parse error, if any */
    setExpression(id, expr) {
      const f = byId(id);
      if (!f) return null;
      f.expr = cleanText(expr);
      refresh(f);
      return entries.get(id).error;
    },
    /** @param {number} id @param {boolean} visible */
    setVisible(id, visible) {
      const f = byId(id);
      if (f) f.visible = Boolean(visible);
    },
    /** @param {'a'|'b'|'c'} name @param {number} value clamped to PARAM_RANGE */
    setParam(name, value) {
      if (!PARAMS.includes(name) || !isFiniteNumber(value)) return;
      state.params[name] = clampParam(value);
      state.functions.forEach(recompile);
    },
    /** @param {string} name one of TOGGLES @param {boolean} on */
    setToggle(name, on) {
      if (TOGGLES.includes(name)) state.show[name] = Boolean(on);
    },
    /** @param {{enabled?: boolean, id?: number, from?: number, to?: number}} patch */
    setIntegral(patch) {
      state.integral = normalizeIntegral({ ...state.integral, ...patch }, state.functions);
    },
    /** @param {object} view ignored when invalid */
    setView(view) {
      if (isValidView(view)) state.view = normalizeView(view);
    },
    resetView() {
      state.view = { ...DEFAULT_VIEW };
    },
    /** @returns {string[]} parameters used by any valid expression, in a-b-c order */
    usedParams() {
      const used = new Set(state.functions.flatMap((f) => entries.get(f.id).params));
      return PARAMS.filter((p) => used.has(p));
    },
    /**
     * @param {object} [view] window to sample (default: the state's view)
     * @param {object} [options] sampleFunction options (yMin/yMax default to the window)
     * @returns {{id: number, color: string, segments: object[][], derivative: object[][]|null}[]}
     */
    curves(view = state.view, options = {}) {
      const band = { yMin: view.yMin, yMax: view.yMax, ...options };
      const sample = (fn) => sampleFunction(fn, view.xMin, view.xMax, band);
      return active().map(({ f, entry }) => ({
        id: f.id,
        color: f.color,
        segments: sample(entry.fn),
        derivative: state.show.derivative ? sample(entry.dfn) : null,
      }));
    },
    /**
     * Roots, extrema and intersections in the window's x range, for the enabled toggles.
     * @param {object} [view] @param {{samples?: number}} [options]
     * @returns {{roots: object[], extrema: object[], intersections: object[]}}
     */
    markers(view = state.view, { samples = 400 } = {}) {
      const list = active();
      const opts = { samples, max: MARKER_CAP };
      const { xMin, xMax } = view;
      const each = (on, find) => (on ? list.flatMap(find) : []);
      const roots = each(state.show.roots, ({ f, entry }) =>
        findRoots(entry.fn, xMin, xMax, opts).map((x) => ({ id: f.id, color: f.color, x, y: 0 })),
      );
      const extrema = each(state.show.extrema, ({ f, entry }) =>
        findExtrema(entry.fn, entry.dfn, xMin, xMax, opts).map((p) => ({ id: f.id, color: f.color, ...p })),
      );
      const intersections = each(state.show.intersections, ({ f, entry }, i) =>
        list.slice(i + 1).flatMap((other) =>
          findIntersections(entry.fn, other.entry.fn, xMin, xMax, opts).map((p) => ({ ids: [f.id, other.f.id], ...p })),
        ),
      );
      return { roots, extrema, intersections };
    },
    /**
     * The integral tool's value and the outline of its area, sampled only where the view shows it.
     * @param {object} [options] sampleFunction options for the shaded area (yMin/yMax default to the view)
     * @returns {{id: number, color: string, from: number, to: number, value: number, segments: object[][]}|null}
     */
    integral(options = {}) {
      const { enabled, id, from, to } = state.integral;
      const f = byId(id);
      const entry = entries.get(id);
      if (!enabled || !f || !f.visible || !entry.fn) return null;
      const { xMin, xMax, yMin, yMax } = state.view;
      const lo = Math.max(Math.min(from, to), xMin);
      const hi = Math.min(Math.max(from, to), xMax);
      const segments = lo < hi ? sampleFunction(entry.fn, lo, hi, { yMin, yMax, ...options }) : [];
      return { id, color: f.color, from, to, value: integralValue(entry.fn, from, to), segments };
    },
    /**
     * @param {number} start @param {number} step @param {number} [count]
     * @returns {{columns: {id: number, color: string, expr: string}[], rows: {x: number, values: number[]}[]}}
     */
    table(start, step, count = 11) {
      const list = active();
      return {
        columns: list.map(({ f }) => ({ id: f.id, color: f.color, expr: f.expr })),
        rows: valuesTable(list.map(({ entry }) => entry.fn), start, step, count),
      };
    },
    /**
     * Snaps a pointer to the nearest visible curve.
     * @param {number} x pointer x (world) @param {number} y pointer y (world)
     * @param {number} unitsPerPxX world units per pixel horizontally @param {number} unitsPerPxY vertically
     * @param {number} [radiusPx] search radius in pixels
     * @returns {{id: number, color: string, x: number, y: number, distance: number}|null}
     */
    trace(x, y, unitsPerPxX, unitsPerPxY, radiusPx = 24) {
      const steps = 24;
      let best = null;
      for (const { f, entry } of active()) {
        for (let i = -steps; i <= steps; i += 1) {
          const sx = x + (i / steps) * radiusPx * unitsPerPxX;
          const sy = entry.fn(sx);
          if (!Number.isFinite(sy)) continue;
          const distance = Math.hypot((sx - x) / unitsPerPxX, (sy - y) / unitsPerPxY);
          if (distance <= radiusPx && (!best || distance < best.distance)) {
            best = { id: f.id, color: f.color, x: sx, y: sy, distance };
          }
        }
      }
      return best;
    },
    /** @returns {string} the state as a URL hash (without "#") */
    toHash: () => encodeState(state),
  };
}

/**
 * Serialises a state for the URL hash, e.g. "f=sin(x)&col=0&a=1&b=1&c=1&v=-10,10,-6,6".
 * @param {object} state
 * @returns {string}
 */
export function encodeState(state) {
  const query = new URLSearchParams();
  state.functions.forEach((f) => query.append('f', f.expr));
  query.set('col', state.functions.map((f) => Math.max(0, COLORS.indexOf(f.color))).join(''));
  const hidden = state.functions.flatMap((f, i) => (f.visible ? [] : [i]));
  if (hidden.length > 0) query.set('hide', hidden.join(''));
  PARAMS.forEach((p) => query.set(p, String(state.params[p])));
  const flags = TOGGLES.filter((t) => state.show[t]).map((t) => t[0]);
  if (flags.length > 0) query.set('show', flags.join(''));
  const index = state.functions.findIndex((f) => f.id === state.integral.id);
  if (state.integral.enabled && index >= 0) query.set('int', [index, state.integral.from, state.integral.to].join(','));
  const { xMin, xMax, yMin, yMax } = state.view;
  query.set('v', [xMin, xMax, yMin, yMax].map((v) => Number(v.toPrecision(12))).join(','));
  return query.toString();
}

/**
 * Reads a URL hash written by encodeState. Anything malformed falls back to defaults.
 * @param {string} hash with or without the leading "#"
 * @returns {object|null} a complete state, or null when the hash holds no functions
 */
export function decodeState(hash) {
  const query = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const exprs = query.getAll('f');
  if (exprs.length === 0) return null;
  const colors = query.get('col') ?? '';
  const hidden = query.get('hide') ?? '';
  const flags = query.get('show') ?? '';
  const [index, from, to] = (query.get('int') ?? '').split(',').map(toNumber);
  const [xMin, xMax, yMin, yMax] = (query.get('v') ?? '').split(',').map(toNumber);
  return normalizeState({
    functions: exprs.slice(0, MAX_FUNCTIONS).map((expr, i) => ({
      id: i + 1,
      expr,
      color: COLORS[Number(colors[i])] ?? COLORS[i],
      visible: !hidden.includes(String(i)),
    })),
    params: Object.fromEntries(PARAMS.map((p) => [p, toNumber(query.get(p))])),
    show: Object.fromEntries(TOGGLES.map((t) => [t, flags.includes(t[0])])),
    integral: { enabled: Number.isInteger(index), id: index + 1, from, to },
    view: { xMin, xMax, yMin, yMax },
  });
}

/**
 * The fixed "?demo" state used for the README screenshot: three curves, roots and
 * intersections marked, the area under sin(x) from 0 to pi shaded.
 * @returns {object} a complete state
 */
export function createDemoState() {
  return normalizeState({
    functions: [
      { id: 1, expr: 'sin(x)', color: COLORS[0] },
      { id: 2, expr: 'x^2/4 - 1', color: COLORS[1] },
      { id: 3, expr: 'a*cos(b*x)', color: COLORS[2] },
    ],
    params: { a: 1.5, b: 0.8, c: 1 },
    show: { roots: true, intersections: true },
    integral: { enabled: true, id: 1, from: 0, to: Math.PI },
    view: { xMin: -6, xMax: 6, yMin: -2.5, yMax: 4.5 },
  });
}

/**
 * Evaluates a constant expression typed into a number field ("pi/2", "-1.5", "2e3").
 * @param {string} text
 * @param {object} [params] values for a, b, c
 * @returns {number} the value, or NaN when the text is invalid or mentions x
 */
export function evaluateConstant(text, params = DEFAULT_PARAMS) {
  try {
    const tree = parse(String(text));
    return dependsOn(tree, 'x') ? NaN : compile(tree, params)(0);
  } catch (error) {
    if (error instanceof ParseError) return NaN;
    throw error;
  }
}
