/**
 * The side panel: function list, parameter sliders, overlay toggles, the integral tool and the
 * table of values. Rows are built with el() (no innerHTML); every change is reported to the app.
 */
import { el, icon } from './dom.js';
import { t, errorText } from './i18n.js';
import { MAX_FUNCTIONS, PARAM_RANGE, evaluateConstant } from './plotter.js';
import { MAX_EXPRESSION_LENGTH } from './tokenizer.js';
import { formatNumber, formatConstant } from './ticks.js';

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const TABLE_ROWS = 11;

/**
 * Display name of the function at a list position: "y₁" for the first.
 * @param {number} index 0-based position (below 9)
 * @returns {string}
 */
export function functionName(index) {
  return `y${SUBSCRIPTS[index + 1]}`;
}

const prettyBound = (value) => formatConstant(value).replace('pi', 'π').replace(/-/g, '−');
const setInvalid = (input, invalid) => input.setAttribute('aria-invalid', String(invalid));

/**
 * Wires the panel elements of index.html.
 * @param {object} app
 * @param {() => object} app.plotter returns the current plotter (it is replaced on reset)
 * @param {() => void} app.changed redraw and save after a change
 * @returns {{render: () => void}} render() rebuilds everything from the plotter state
 */
export function createPanel(app) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    list: $('fn-list'),
    count: $('fn-count'),
    add: $('fn-add'),
    paramsCard: $('params-card'),
    params: $('param-list'),
    toggles: [...document.querySelectorAll('[data-toggle]')],
    intOn: $('int-on'),
    intFn: $('int-fn'),
    intFrom: $('int-from'),
    intTo: $('int-to'),
    intMsg: $('int-msg'),
    intResult: $('int-result'),
    tableCard: $('table-card'),
    tableStart: $('tbl-start'),
    tableStep: $('tbl-step'),
    tableMsg: $('tbl-msg'),
    tableHead: $('tbl-head'),
    tableBody: $('tbl-body'),
  };
  const rows = new Map();
  const sliders = new Map();
  let paramKey = null;
  let optionKey = null;

  const plotter = () => app.plotter();
  const commit = () => {
    update();
    app.changed();
  };

  function addFunction() {
    const id = plotter().addFunction('');
    if (id === null) return;
    render();
    rows.get(id).input.focus();
    app.changed();
  }

  function removeFunction(id) {
    const index = plotter().listFunctions().findIndex((f) => f.id === id);
    plotter().removeFunction(id);
    render();
    const next = plotter().listFunctions()[index] ?? plotter().listFunctions().at(-1);
    (next ? rows.get(next.id).remove : ui.add).focus();
    app.changed();
  }

  function toggleVisible(id) {
    const f = plotter().listFunctions().find((g) => g.id === id);
    plotter().setVisible(id, !f.visible);
    commit();
  }

  /** Enter moves to the next function, or adds one after the last. */
  function onEnter(event, id) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const ids = plotter().listFunctions().map((f) => f.id);
    const next = ids[ids.indexOf(id) + 1];
    if (next === undefined) addFunction();
    else rows.get(next).input.focus();
  }

  function buildRow(f, index) {
    const n = index + 1;
    const input = el('input', {
      className: 'fn-input',
      type: 'text',
      id: `fn-input-${f.id}`,
      value: f.expr,
      spellcheck: false,
      autocomplete: 'off',
      maxLength: MAX_EXPRESSION_LENGTH,
      attrs: {
        autocapitalize: 'off',
        autocorrect: 'off',
        enterkeyhint: 'next',
        placeholder: t('placeholder'),
        'aria-label': t('functionInput', { n }),
        'aria-describedby': `fn-msg-${f.id}`,
      },
      on: {
        input: () => {
          plotter().setExpression(f.id, input.value);
          commit();
        },
        keydown: (event) => onEnter(event, f.id),
      },
    });
    // A toggle keeps one accessible name; aria-pressed and the tooltip (set in updateRows) give the state.
    const eye = el('button', {
      className: 'icon-btn',
      type: 'button',
      attrs: { 'aria-label': t('showFunction', { n }) },
      on: { click: () => toggleVisible(f.id) },
    });
    const removeLabel = t('removeFunction', { n });
    const remove = el(
      'button',
      {
        className: 'icon-btn',
        type: 'button',
        title: removeLabel,
        attrs: { 'aria-label': removeLabel },
        on: { click: () => removeFunction(f.id) },
      },
      icon('close'),
    );
    const message = el('p', { className: 'fn-msg', id: `fn-msg-${f.id}`, hidden: true });
    const derivative = el('p', { className: 'fn-deriv', hidden: true });
    const row = el(
      'li',
      { className: 'fn-row' },
      el(
        'label',
        { className: 'fn-label', htmlFor: input.id },
        el('span', { className: 'fn-dot', attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'fn-name', text: `${functionName(index)} =` }),
      ),
      input,
      eye,
      remove,
      message,
      derivative,
    );
    row.style.setProperty('--fn', f.color);
    rows.set(f.id, { row, input, eye, remove, message, derivative, visible: null });
    return row;
  }

  function updateRows(functions, show) {
    functions.forEach((f, index) => {
      const row = rows.get(f.id);
      const error = f.error && f.error.code !== 'empty' ? errorText(f.error) : '';
      row.row.classList.toggle('is-hidden', !f.visible);
      setInvalid(row.input, Boolean(error));
      row.message.textContent = error;
      row.message.hidden = !error;
      const derivative = show.derivative && !f.error ? `${functionName(index)}′ = ${f.derivativeText}` : '';
      row.derivative.textContent = derivative;
      row.derivative.title = derivative;
      row.derivative.hidden = !derivative;
      if (row.visible !== f.visible) {
        row.visible = f.visible;
        row.eye.replaceChildren(icon(f.visible ? 'eye' : 'eyeOff'));
        row.eye.setAttribute('aria-pressed', String(f.visible));
        row.eye.title = t(f.visible ? 'hideFunction' : 'showFunction', { n: index + 1 });
      }
    });
  }

  function buildSlider(name) {
    const id = `param-${name}`;
    const range = el('input', {
      type: 'range',
      id,
      min: String(PARAM_RANGE.min),
      max: String(PARAM_RANGE.max),
      step: String(PARAM_RANGE.step),
      attrs: { 'aria-label': t('paramLabel', { name }) },
      on: {
        input: () => {
          plotter().setParam(name, Number(range.value));
          applyBounds();
          commit();
        },
      },
    });
    const output = el('output', { className: 'param-value', attrs: { for: id } });
    sliders.set(name, { range, output });
    return el('div', { className: 'param-row' }, el('label', { className: 'param-name', htmlFor: id, text: name }), range, output);
  }

  function updateParams(used, values) {
    ui.paramsCard.hidden = used.length === 0;
    if (used.join('') !== paramKey) {
      paramKey = used.join('');
      sliders.clear();
      ui.params.replaceChildren(...used.map(buildSlider));
    }
    for (const name of used) {
      const { range, output } = sliders.get(name);
      if (Number(range.value) !== values[name]) range.value = String(values[name]);
      output.textContent = formatNumber(values[name], 4);
    }
  }

  /** Reads both bound fields (constant expressions such as "pi/2"); invalid ones keep the old value. */
  function applyBounds() {
    const { params } = plotter().getState();
    let invalid = false;
    for (const [input, key] of [[ui.intFrom, 'from'], [ui.intTo, 'to']]) {
      const value = evaluateConstant(input.value, params);
      const ok = Number.isFinite(value);
      setInvalid(input, !ok);
      if (ok) plotter().setIntegral({ [key]: value });
      invalid ||= !ok;
    }
    ui.intMsg.hidden = !invalid;
  }

  function updateIntegralOptions(functions, selected) {
    const options = functions.map((f, i) => ({ value: String(f.id), text: `${functionName(i)} = ${f.expr || '…'}` }));
    const key = options.map((o) => `${o.value}:${o.text}`).join('\n');
    if (key !== optionKey) {
      optionKey = key;
      ui.intFn.replaceChildren(...options.map((o) => el('option', o)));
    }
    ui.intFn.disabled = functions.length === 0;
    if (selected !== null) ui.intFn.value = String(selected);
  }

  /** The result line: a message, or "∫ (to over from) yₙ dx = value" in the function's colour. */
  function integralText(functions, integral) {
    if (!integral.enabled) return t('integralOff');
    const result = plotter().integral();
    if (!result) return t('integralUnavailable');
    if (!Number.isFinite(result.value)) return t('integralUndefined');
    const name = functionName(functions.findIndex((f) => f.id === result.id));
    const value = el('strong', { text: formatNumber(result.value, 10).replace(/-/g, '−') });
    value.style.color = result.color;
    return [
      el('span', { className: 'int-sign', text: '∫' }),
      el('span', { className: 'int-bounds' }, el('sup', { text: prettyBound(result.to) }), el('sub', { text: prettyBound(result.from) })),
      ` ${name} dx = `,
      value,
    ];
  }

  function updateIntegral(functions, integral) {
    ui.intOn.checked = integral.enabled;
    updateIntegralOptions(functions, integral.id);
    const text = integralText(functions, integral);
    ui.intResult.classList.toggle('is-muted', typeof text === 'string');
    ui.intResult.replaceChildren(...[text].flat());
  }

  function updateTable(functions) {
    if (!ui.tableCard.open) return;
    const { params } = plotter().getState();
    const start = evaluateConstant(ui.tableStart.value, params);
    const step = evaluateConstant(ui.tableStep.value, params);
    setInvalid(ui.tableStart, !Number.isFinite(start));
    setInvalid(ui.tableStep, !Number.isFinite(step) || step === 0);
    const valid = Number.isFinite(start) && Number.isFinite(step) && step !== 0;
    const table = valid ? plotter().table(start, step, TABLE_ROWS) : null;
    const problem = !valid ? t('tableInvalid') : table.columns.length === 0 ? t('tableEmpty') : '';
    ui.tableMsg.textContent = problem;
    ui.tableMsg.hidden = !problem;
    if (problem) {
      ui.tableHead.replaceChildren();
      ui.tableBody.replaceChildren();
      return;
    }
    const position = new Map(functions.map((f, i) => [f.id, i]));
    const heads = table.columns.map((c) => {
      const cell = el('th', { scope: 'col', title: c.expr }, el('span', { className: 'fn-dot' }), functionName(position.get(c.id)));
      cell.style.setProperty('--fn', c.color);
      return cell;
    });
    ui.tableHead.replaceChildren(el('tr', {}, el('th', { scope: 'col', text: 'x' }), ...heads));
    ui.tableBody.replaceChildren(
      ...table.rows.map((r) =>
        el('tr', {}, el('th', { text: formatNumber(r.x, 8) }), ...r.values.map((v) => el('td', { text: formatNumber(v, 6) }))),
      ),
    );
  }

  /** Refreshes everything that depends on the state, without touching what the user is typing. */
  function update() {
    const state = plotter().getState();
    const functions = plotter().listFunctions();
    updateRows(functions, state.show);
    ui.count.textContent = t('count', { n: functions.length, max: MAX_FUNCTIONS });
    ui.add.disabled = functions.length >= MAX_FUNCTIONS;
    updateParams(plotter().usedParams(), state.params);
    for (const button of ui.toggles) button.setAttribute('aria-pressed', String(state.show[button.dataset.toggle]));
    updateIntegral(functions, state.integral);
    updateTable(functions);
  }

  function render() {
    rows.clear();
    const functions = plotter().listFunctions();
    const items = functions.length > 0 ? functions.map(buildRow) : [el('li', { className: 'fn-empty', text: t('noFunctions') })];
    ui.list.replaceChildren(...items);
    paramKey = null;
    optionKey = null;
    const { integral } = plotter().getState();
    ui.intFrom.value = formatConstant(integral.from);
    ui.intTo.value = formatConstant(integral.to);
    setInvalid(ui.intFrom, false);
    setInvalid(ui.intTo, false);
    ui.intMsg.hidden = true;
    update();
  }

  ui.add.addEventListener('click', addFunction);
  for (const button of ui.toggles) {
    button.addEventListener('click', () => {
      const name = button.dataset.toggle;
      plotter().setToggle(name, !plotter().getState().show[name]);
      commit();
    });
  }
  ui.intOn.addEventListener('change', () => {
    plotter().setIntegral({ enabled: ui.intOn.checked });
    commit();
  });
  ui.intFn.addEventListener('change', () => {
    plotter().setIntegral({ id: Number(ui.intFn.value) });
    commit();
  });
  for (const input of [ui.intFrom, ui.intTo]) {
    input.addEventListener('input', () => {
      applyBounds();
      commit();
    });
  }
  ui.tableCard.addEventListener('toggle', () => updateTable(plotter().listFunctions()));
  for (const input of [ui.tableStart, ui.tableStep]) {
    input.addEventListener('input', () => updateTable(plotter().listFunctions()));
  }

  return { render };
}
