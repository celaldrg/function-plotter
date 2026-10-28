import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, setLanguage, getLanguage, t, errorText } from '../src/i18n.js';
import { parse } from '../src/parser.js';
import { ParseError, MAX_EXPRESSION_LENGTH } from '../src/tokenizer.js';

/** One input for each parse error code. */
const BAD_INPUTS = [
  '',
  'x'.repeat(MAX_EXPRESSION_LENGTH + 1),
  '2 $ 3',
  '1.2.3',
  '1e999',
  '2*foo(x)',
  '2+*3',
  '2+',
  'x 2',
  'sin(x',
  'x+1)',
  'sin x',
  'min(x)',
];

function failure(text) {
  try {
    parse(text);
  } catch (error) {
    if (error instanceof ParseError) return error;
    throw error;
  }
  throw new Error(`${JSON.stringify(text)} should not parse`);
}

test('English and Turkish define the same keys, and none is empty', () => {
  assert.deepEqual(Object.keys(DICTIONARIES.tr).sort(), Object.keys(DICTIONARIES.en).sort());
  for (const [lang, dictionary] of Object.entries(DICTIONARIES)) {
    for (const [key, value] of Object.entries(dictionary)) assert.ok(value.trim() !== '', `${lang}.${key} is empty`);
  }
});

test('every parse error has a message in both languages with a 1-based position', () => {
  const codes = new Set(BAD_INPUTS.map((text) => failure(text).code));
  assert.equal(codes.size, BAD_INPUTS.length, 'each input covers a different code');
  for (const lang of ['en', 'tr']) {
    setLanguage(lang);
    for (const text of BAD_INPUTS) {
      const message = errorText(failure(text));
      assert.ok(!message.startsWith('error.'), `${lang}: no message for ${JSON.stringify(text)}`);
      assert.ok(!/\{\w+\}/.test(message), `${lang}: unfilled placeholder in "${message}"`);
    }
  }
  setLanguage('en');
  assert.equal(errorText(failure('2*foo(x)')), 'Unknown name "foo" at position 3');
  assert.equal(errorText(failure('x'.repeat(MAX_EXPRESSION_LENGTH + 1))), `Too long: at most ${MAX_EXPRESSION_LENGTH} characters`);
  setLanguage('tr');
  assert.equal(errorText(failure('2*foo(x)')), '3. konumda bilinmeyen ad: "foo"');
  setLanguage('en');
});

test('t fills placeholders; unknown languages fall back to English, unknown keys to the key', () => {
  assert.equal(setLanguage('tr'), 'tr');
  assert.equal(t('title'), 'Fonksiyon Çizici');
  assert.equal(t('functionInput', { n: 3 }), '3. fonksiyon');
  assert.equal(t('count', { n: 2, max: 6 }), '2 / 6');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(setLanguage('xx'), 'en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('removeFunction', { n: 1 }), 'Remove function 1');
  assert.equal(t('removeFunction'), 'Remove function {n}', 'a missing value leaves the placeholder');
});
