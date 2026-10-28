/**
 * Tokenizer for y = f(x) expressions. Pure module (no DOM).
 */
import { NAMES } from './functions.js';

/** Longest accepted expression, in characters. */
export const MAX_EXPRESSION_LENGTH = 200;

const MESSAGES = {
  empty: () => 'The expression is empty',
  tooLong: () => `The expression is longer than ${MAX_EXPRESSION_LENGTH} characters`,
  unexpectedChar: (d) => `Unexpected character "${d}"`,
  badNumber: (d) => `Malformed number "${d}"`,
  hugeNumber: (d) => `The number "${d}" is too large`,
  unknownName: (d) => `Unknown name "${d}"`,
  unexpectedToken: (d) => `Unexpected "${d}"`,
  unexpectedEnd: () => 'The expression ends too early',
  missingOperator: () => 'Missing operator before this number',
  unclosedParen: () => 'This "(" is never closed',
  unmatchedParen: () => 'This ")" has no matching "("',
  expectedParen: (d) => `"${d}" needs parentheses, e.g. ${d}(x)`,
  argCount: (d) => `Wrong number of arguments for "${d}"`,
};

/** Error for malformed input. `code` is stable (for translations), `pos` is a 0-based index. */
export class ParseError extends Error {
  /**
   * @param {keyof typeof MESSAGES} code machine-readable reason
   * @param {number} pos 0-based index into the source text
   * @param {string} [detail] offending text, e.g. the unknown name
   */
  constructor(code, pos, detail = '') {
    const where = code === 'empty' || code === 'tooLong' ? '' : ` at position ${pos + 1}`;
    super(MESSAGES[code](detail) + where);
    this.name = 'ParseError';
    this.code = code;
    this.pos = pos;
    this.detail = detail;
  }
}

const OPERATORS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^' };
const PUNCTUATION = { '(': 'lparen', ')': 'rparen', ',': 'comma' };
const NUMBER = /(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/iy;
const LETTERS = /[a-z]+/iy;
const DIGITS = /\d+/y;

function matchAt(regex, text, index) {
  regex.lastIndex = index;
  const match = regex.exec(text);
  return match ? match[0] : '';
}

function readNumber(text, start, tokens) {
  const raw = matchAt(NUMBER, text, start);
  const end = start + raw.length;
  if (text[end] === '.') throw new ParseError('badNumber', start, raw + '.');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ParseError('hugeNumber', start, raw); // 1e999 would be Infinity
  tokens.push({ type: 'num', value, text: raw, pos: start });
  return end;
}

/** Splits a run such as "2pix" or "ax" into known names, longest match first. */
function splitRun(run, start, tokens) {
  const lower = run.toLowerCase();
  const parts = [];
  for (let k = 0; k < lower.length; ) {
    const name = NAMES.find((candidate) => lower.startsWith(candidate, k));
    if (!name) throw new ParseError('unknownName', start, run);
    parts.push({ type: 'name', value: name, text: run.slice(k, k + name.length), pos: start + k });
    k += name.length;
  }
  tokens.push(...parts);
}

function readName(text, start, tokens) {
  let run = matchAt(LETTERS, text, start);
  const digits = matchAt(DIGITS, text, start + run.length);
  if (digits && NAMES.includes((run + digits).toLowerCase())) run += digits;
  splitRun(run, start, tokens);
  return start + run.length;
}

/**
 * Splits an expression into tokens: num, name, op, lparen, rparen, comma and a final end token.
 * Accepts "π", "×", "·", "÷", "−" and "**" as friendly aliases.
 * @param {string} text the expression
 * @returns {{type: string, value?: (string|number), text?: string, pos: number}[]}
 * @throws {ParseError}
 */
export function tokenize(text) {
  if (text.length > MAX_EXPRESSION_LENGTH) throw new ParseError('tooLong', MAX_EXPRESSION_LENGTH);
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (/\d/.test(ch) || (ch === '.' && /\d/.test(text[i + 1] ?? ''))) {
      i = readNumber(text, i, tokens);
    } else if (/[a-z]/i.test(ch)) {
      i = readName(text, i, tokens);
    } else if (ch === 'π') {
      tokens.push({ type: 'name', value: 'pi', text: ch, pos: i });
      i += 1;
    } else if (ch === '*' && text[i + 1] === '*') {
      tokens.push({ type: 'op', value: '^', text: '**', pos: i });
      i += 2;
    } else if (OPERATORS[ch]) {
      tokens.push({ type: 'op', value: OPERATORS[ch], text: ch, pos: i });
      i += 1;
    } else if (PUNCTUATION[ch]) {
      tokens.push({ type: PUNCTUATION[ch], text: ch, pos: i });
      i += 1;
    } else {
      throw new ParseError('unexpectedChar', i, ch);
    }
  }
  tokens.push({ type: 'end', text: '', pos: text.length });
  return tokens;
}
