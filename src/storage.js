/**
 * localStorage access that never throws: private windows, disabled storage and full quotas
 * simply behave like an empty store. Nothing is touched at import time.
 */

const PREFIX = 'function-plotter:';

/**
 * Reads a stored text.
 * @param {string} key short key, e.g. "lang"
 * @param {string|null} [fallback] returned when nothing is stored or storage is unavailable
 * @returns {string|null}
 */
export function load(key, fallback = null) {
  try {
    return globalThis.localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Stores a text.
 * @param {string} key short key, e.g. "lang"
 * @param {string} value
 * @returns {boolean} whether it was saved
 */
export function save(key, value) {
  try {
    globalThis.localStorage.setItem(PREFIX + key, String(value));
    return true;
  } catch {
    return false;
  }
}
