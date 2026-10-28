/**
 * Axis ticks on "nice" steps (1, 2 or 5 times a power of ten) and noise-free number labels.
 */

const trimExponent = (text) => text.replace(/\.?0+e/, 'e').replace('e+', 'e');

/**
 * Splits the nice step for a span into mantissa (1, 2 or 5) and power of ten.
 * @param {number} span visible range width (> 0)
 * @param {number} [target] wanted number of intervals (default 8)
 * @returns {{mantissa: 1 | 2 | 5, exponent: number, step: number}}
 */
export function niceStep(span, target = 8) {
  const raw = span / Math.max(1, target);
  let exponent = Math.floor(Math.log10(raw));
  const normalized = raw / 10 ** exponent;
  let mantissa = 10;
  if (normalized < 1.5) mantissa = 1;
  else if (normalized < 3.5) mantissa = 2;
  else if (normalized < 7.5) mantissa = 5;
  if (mantissa === 10) {
    mantissa = 1;
    exponent += 1;
  }
  return { mantissa, exponent, step: scaled(mantissa, exponent) };
}

/** k * 10^exponent computed so that decimal steps land on exact decimals (0.3, not 0.30000000000000004). */
function scaled(k, exponent) {
  return exponent < 0 ? k / 10 ** -exponent : k * 10 ** exponent;
}

/**
 * Formats a tick value with just the digits its step needs: "0.3", "-15", "2.5e-7", "1.2e8".
 * @param {number} value tick value
 * @param {number} exponent power of ten of the step (from niceStep)
 * @param {boolean} [scientific] use 1.2e8 notation (default: for very large or very small steps)
 * @returns {string}
 */
export function formatTick(value, exponent, scientific = exponent >= 6 || exponent <= -5) {
  if (value === 0) return '0';
  if (scientific) {
    const digits = Math.max(0, Math.floor(Math.log10(Math.abs(value))) - exponent);
    return trimExponent(value.toExponential(Math.min(digits, 20)));
  }
  return String(Number(value.toFixed(Math.max(0, -exponent))));
}

/**
 * Ticks covering [min, max].
 * @param {number} min range start
 * @param {number} max range end (> min)
 * @param {number} [target] wanted number of intervals (default 8)
 * @returns {{step: number, ticks: {value: number, label: string}[]}}
 */
export function generateTicks(min, max, target = 8) {
  const { mantissa, exponent, step } = niceStep(max - min, target);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const size = Math.max(Math.abs(min), Math.abs(max));
  const scientific = size >= 1e6 || size < 1e-4;
  const ticks = [];
  for (let k = first; k <= last; k += 1) {
    const value = scaled(k * mantissa, exponent);
    ticks.push({ value, label: formatTick(value, exponent, scientific) });
  }
  return { step, ticks };
}

const PI_DENOMINATORS = [1, 2, 3, 4, 6];

/**
 * Writes a number for an input field that parses back to it: multiples of pi as "pi", "-pi/2"
 * or "3pi/4", anything else with up to 10 significant digits.
 * @param {number} value finite number
 * @returns {string}
 */
export function formatConstant(value) {
  for (const d of PI_DENOMINATORS) {
    const k = Math.round((value * d) / Math.PI);
    if (k !== 0 && Math.abs(k) <= 48 && Math.abs(value - (k * Math.PI) / d) <= 1e-12 * Math.abs(value)) {
      const top = Math.abs(k) === 1 ? 'pi' : `${Math.abs(k)}pi`;
      return `${k < 0 ? '-' : ''}${top}${d === 1 ? '' : `/${d}`}`;
    }
  }
  return formatNumber(value, 10);
}

/**
 * Formats any value for read-outs (trace, table, markers): up to `digits` significant digits.
 * @param {number} value
 * @param {number} [digits] significant digits (default 6)
 * @returns {string} "—" for undefined values, "∞" / "-∞" for infinities
 */
export function formatNumber(value, digits = 6) {
  if (Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const size = Math.abs(value);
  if (size === 0) return '0';
  if (size >= 1e6 || size < 1e-4) return trimExponent(value.toExponential(digits - 1));
  return String(Number(value.toPrecision(digits)));
}
