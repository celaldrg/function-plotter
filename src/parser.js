/**
 * Recursive-descent parser for y = f(x). No eval, no Function constructor.
 *
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/') unary | power)*      // the bare power is implicit multiplication
 *   unary      := ('-' | '+') unary | power               // -x^2 = -(x^2)
 *   power      := primary ('^' unary)?                    // right-associative: 2^3^2 = 2^9
 *   primary    := number | name | name '(' args ')' | '(' expression ')'
 */
import { tokenize, ParseError } from './tokenizer.js';
import { FUNCTIONS, CONSTANTS } from './functions.js';
import { num, variable, constant, neg, bin, call } from './ast.js';

function createCursor(tokens) {
  let index = 0;
  return {
    peek: () => tokens[index],
    next: () => tokens[index++],
  };
}

const isOp = (token, ...ops) => token.type === 'op' && ops.includes(token.value);

function unexpected(token) {
  if (token.type === 'end') return new ParseError('unexpectedEnd', token.pos);
  return new ParseError('unexpectedToken', token.pos, token.text);
}

function expectClose(cursor, openPos) {
  const token = cursor.next();
  if (token.type === 'rparen') return;
  if (token.type === 'end') throw new ParseError('unclosedParen', openPos);
  throw unexpected(token);
}

function parseExpression(cursor) {
  let left = parseTerm(cursor);
  while (isOp(cursor.peek(), '+', '-')) {
    const op = cursor.next().value;
    left = bin(op, left, parseTerm(cursor));
  }
  return left;
}

function parseTerm(cursor) {
  let left = parseUnary(cursor);
  for (;;) {
    const token = cursor.peek();
    if (isOp(token, '*', '/')) {
      cursor.next();
      left = bin(token.value, left, parseUnary(cursor));
    } else if (token.type === 'name' || token.type === 'lparen') {
      left = bin('*', left, parsePower(cursor));
    } else if (token.type === 'num') {
      throw new ParseError('missingOperator', token.pos, token.text);
    } else {
      return left;
    }
  }
}

function parseUnary(cursor) {
  if (isOp(cursor.peek(), '-', '+')) {
    const op = cursor.next().value;
    const arg = parseUnary(cursor);
    return op === '-' ? neg(arg) : arg;
  }
  return parsePower(cursor);
}

function parsePower(cursor) {
  const base = parsePrimary(cursor);
  if (!isOp(cursor.peek(), '^')) return base;
  cursor.next();
  return bin('^', base, parseUnary(cursor));
}

function parseCall(cursor, nameToken) {
  const name = nameToken.value;
  const open = cursor.next();
  if (open.type !== 'lparen') throw new ParseError('expectedParen', nameToken.pos, name);
  if (cursor.peek().type === 'rparen') throw new ParseError('argCount', nameToken.pos, name);
  const args = [parseExpression(cursor)];
  while (cursor.peek().type === 'comma') {
    cursor.next();
    args.push(parseExpression(cursor));
  }
  expectClose(cursor, open.pos);
  if (args.length !== FUNCTIONS[name].arity) throw new ParseError('argCount', nameToken.pos, name);
  return call(name, args);
}

function parsePrimary(cursor) {
  const token = cursor.next();
  if (token.type === 'num') return num(token.value);
  if (token.type === 'lparen') {
    const inner = parseExpression(cursor);
    expectClose(cursor, token.pos);
    return inner;
  }
  if (token.type !== 'name') throw unexpected(token);
  if (FUNCTIONS[token.value]) return parseCall(cursor, token);
  return token.value in CONSTANTS ? constant(token.value) : variable(token.value);
}

/**
 * Parses an expression in x (with optional parameters a, b, c) into an expression tree.
 * Supports implicit multiplication (2x, 3sin(x), (x+1)(x-1), 2pi).
 * @param {string} text the expression, e.g. "2x^2 - sin(x)/3"
 * @returns {object} the tree (see ast.js)
 * @throws {ParseError} with `code` and 0-based `pos`
 */
export function parse(text) {
  const tokens = tokenize(text);
  if (tokens.length === 1) throw new ParseError('empty', 0);
  const cursor = createCursor(tokens);
  const tree = parseExpression(cursor);
  const rest = cursor.peek();
  if (rest.type === 'rparen') throw new ParseError('unmatchedParen', rest.pos);
  if (rest.type !== 'end') throw unexpected(rest);
  return tree;
}
