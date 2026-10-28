import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save } from '../src/storage.js';

/** Runs fn with globalThis.localStorage replaced by `storage`, then restores the original. */
function withStorage(storage, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    items,
  };
}

test('values round-trip under a prefixed key', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    assert.equal(load('lang'), null);
    assert.equal(load('lang', 'en'), 'en');
    assert.equal(save('lang', 'tr'), true);
    assert.equal(load('lang', 'en'), 'tr');
  });
  assert.deepEqual([...storage.items.keys()], ['function-plotter:lang']);
});

test('missing or failing storage falls back quietly', () => {
  withStorage(undefined, () => {
    assert.equal(load('lang', 'en'), 'en');
    assert.equal(save('lang', 'tr'), false);
  });
  const failing = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  withStorage(failing, () => {
    assert.equal(load('state'), null);
    assert.equal(save('state', 'f=x'), false);
  });
});
