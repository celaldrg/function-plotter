/**
 * English and Turkish interface strings, with {name} placeholders. Pure module: the current
 * language is plain module state; main.js applies the strings to the page.
 */
import { MAX_EXPRESSION_LENGTH } from './tokenizer.js';

const EN = {
  title: 'Function Plotter',
  share: 'Share',
  shareHint: 'Copy a link to this plot',
  png: 'PNG',
  pngHint: 'Download the plot as a PNG image',
  reset: 'Reset',
  resetHint: 'Start over with the default plot',
  switchLanguage: 'TR: switch to Turkish',
  plotLabel: 'Plot of the functions. Drag to pan, scroll or pinch to zoom, arrow keys pan, + and - zoom.',
  zoomIn: 'Zoom in (+)',
  zoomOut: 'Zoom out (-)',
  resetView: 'Reset view (0)',
  hintMouse: 'Drag to pan · scroll to zoom · hover a curve to trace',
  hintTouch: 'Drag to pan · pinch to zoom · tap a curve to trace',
  max: 'max',
  min: 'min',
  controls: 'Controls',
  functions: 'Functions',
  count: '{n} / {max}',
  add: 'Add',
  addHint: 'Add a function',
  placeholder: 'e.g. x^2 - 1',
  functionInput: 'Function {n}',
  showFunction: 'Show function {n}',
  hideFunction: 'Hide function {n}',
  removeFunction: 'Remove function {n}',
  noFunctions: 'No functions yet. Add one to start plotting.',
  parameters: 'Parameters',
  paramLabel: 'Parameter {name}',
  show: 'Show',
  derivative: 'Derivative',
  roots: 'Roots',
  extrema: 'Extrema',
  intersections: 'Intersections',
  integral: 'Integral',
  shadeArea: 'Shade the area under a curve',
  integralFunction: 'Function',
  from: 'From',
  to: 'To',
  boundInvalid: 'Enter a number such as 2, -1.5 or pi/2.',
  integralOff: 'Switch on to shade the area and get its value.',
  integralUnavailable: 'Pick a visible function without errors.',
  integralUndefined: 'Could not be computed here (it may diverge).',
  table: 'Table of values',
  start: 'Start',
  step: 'Step',
  tableInvalid: 'Start and step must be numbers, and the step cannot be 0.',
  tableEmpty: 'No visible functions to tabulate.',
  syntax: 'Syntax',
  syntaxOperators: 'Operators',
  syntaxOperatorsText: '+ - * / ^ and implicit products: 2x, 3sin(x), (x+1)(x-1)',
  syntaxFunctions: 'Functions',
  syntaxConstants: 'Constants',
  syntaxConstantsText: 'pi and e; a, b and c get sliders',
  syntaxKeys: 'Keyboard',
  syntaxKeysText: 'arrows pan, + and - zoom, 0 resets the view, Enter jumps to the next function',
  footer: 'MIT · Source on GitHub',
  linkCopied: 'Link copied to the clipboard',
  linkManual: 'Copy the link from the address bar',
  resetDone: 'Plot reset',
  undo: 'Undo',
  'error.empty': 'The expression is empty',
  'error.tooLong': 'Too long: at most {max} characters',
  'error.unexpectedChar': 'Unexpected character "{detail}" at position {pos}',
  'error.badNumber': 'Malformed number "{detail}" at position {pos}',
  'error.hugeNumber': 'The number "{detail}" at position {pos} is too large',
  'error.unknownName': 'Unknown name "{detail}" at position {pos}',
  'error.unexpectedToken': 'Unexpected "{detail}" at position {pos}',
  'error.unexpectedEnd': 'The expression ends too early (position {pos})',
  'error.missingOperator': 'Missing operator before position {pos}',
  'error.unclosedParen': 'The "(" at position {pos} is never closed',
  'error.unmatchedParen': 'The ")" at position {pos} has no matching "("',
  'error.expectedParen': '"{detail}" at position {pos} needs parentheses, e.g. {detail}(x)',
  'error.argCount': 'Wrong number of arguments for "{detail}" at position {pos}',
};

const TR = {
  title: 'Fonksiyon Çizici',
  share: 'Paylaş',
  shareHint: 'Bu grafiğin bağlantısını kopyala',
  png: 'PNG',
  pngHint: 'Grafiği PNG görseli olarak indir',
  reset: 'Sıfırla',
  resetHint: 'Varsayılan grafikle baştan başla',
  switchLanguage: 'EN: İngilizceye geç',
  plotLabel:
    'Fonksiyonların grafiği. Kaydırmak için sürükleyin, yakınlaştırmak için tekerleği veya iki parmağı kullanın; oklar kaydırır, + ve - yakınlaştırır.',
  zoomIn: 'Yakınlaştır (+)',
  zoomOut: 'Uzaklaştır (-)',
  resetView: 'Görünümü sıfırla (0)',
  hintMouse: 'Kaydırmak için sürükle · yakınlaştırmak için tekerlek · izlemek için eğrinin üzerine gel',
  hintTouch: 'Kaydırmak için sürükle · yakınlaştırmak için iki parmak · izlemek için eğriye dokun',
  max: 'maks',
  min: 'min',
  controls: 'Kontroller',
  functions: 'Fonksiyonlar',
  count: '{n} / {max}',
  add: 'Ekle',
  addHint: 'Fonksiyon ekle',
  placeholder: 'örn. x^2 - 1',
  functionInput: '{n}. fonksiyon',
  showFunction: '{n}. fonksiyonu göster',
  hideFunction: '{n}. fonksiyonu gizle',
  removeFunction: '{n}. fonksiyonu kaldır',
  noFunctions: 'Henüz fonksiyon yok. Çizmeye başlamak için bir tane ekleyin.',
  parameters: 'Parametreler',
  paramLabel: '{name} parametresi',
  show: 'Göster',
  derivative: 'Türev',
  roots: 'Kökler',
  extrema: 'Ekstremumlar',
  intersections: 'Kesişimler',
  integral: 'İntegral',
  shadeArea: 'Bir eğrinin altındaki alanı tara',
  integralFunction: 'Fonksiyon',
  from: 'Alt sınır',
  to: 'Üst sınır',
  boundInvalid: '2, -1.5 veya pi/2 gibi bir sayı girin.',
  integralOff: 'Alanı taramak ve değerini görmek için açın.',
  integralUnavailable: 'Görünür ve hatasız bir fonksiyon seçin.',
  integralUndefined: 'Burada hesaplanamadı (ıraksıyor olabilir).',
  table: 'Değer tablosu',
  start: 'Başlangıç',
  step: 'Adım',
  tableInvalid: 'Başlangıç ve adım sayı olmalı, adım 0 olamaz.',
  tableEmpty: 'Tabloya konacak görünür fonksiyon yok.',
  syntax: 'Sözdizimi',
  syntaxOperators: 'İşlemler',
  syntaxOperatorsText: '+ - * / ^ ve örtük çarpım: 2x, 3sin(x), (x+1)(x-1)',
  syntaxFunctions: 'Fonksiyonlar',
  syntaxConstants: 'Sabitler',
  syntaxConstantsText: 'pi ve e; a, b ve c için kaydırıcı çıkar',
  syntaxKeys: 'Klavye',
  syntaxKeysText: 'oklar kaydırır, + ve - yakınlaştırır, 0 görünümü sıfırlar, Enter sonraki fonksiyona geçer',
  footer: 'MIT · Kaynak kodu GitHub’da',
  linkCopied: 'Bağlantı panoya kopyalandı',
  linkManual: 'Bağlantıyı adres çubuğundan kopyalayın',
  resetDone: 'Grafik sıfırlandı',
  undo: 'Geri al',
  'error.empty': 'İfade boş',
  'error.tooLong': 'Çok uzun: en fazla {max} karakter',
  'error.unexpectedChar': '{pos}. konumda beklenmeyen karakter: "{detail}"',
  'error.badNumber': '{pos}. konumda hatalı sayı: "{detail}"',
  'error.hugeNumber': '{pos}. konumdaki "{detail}" sayısı çok büyük',
  'error.unknownName': '{pos}. konumda bilinmeyen ad: "{detail}"',
  'error.unexpectedToken': '{pos}. konumda beklenmeyen "{detail}"',
  'error.unexpectedEnd': 'İfade erken bitiyor ({pos}. konum)',
  'error.missingOperator': '{pos}. konumdan önce işlem eksik',
  'error.unclosedParen': '{pos}. konumdaki "(" kapatılmamış',
  'error.unmatchedParen': '{pos}. konumdaki ")" ile eşleşen "(" yok',
  'error.expectedParen': '{pos}. konumdaki "{detail}" parantez ister, örn. {detail}(x)',
  'error.argCount': '{pos}. konumdaki "{detail}" için argüman sayısı yanlış',
};

/** All dictionaries by language code; English is the default and the fallback. */
export const DICTIONARIES = Object.freeze({ en: Object.freeze(EN), tr: Object.freeze(TR) });

let current = 'en';

/**
 * Selects the interface language.
 * @param {string} lang "en" or "tr"; anything else selects English
 * @returns {string} the language now in use
 */
export function setLanguage(lang) {
  current = Object.hasOwn(DICTIONARIES, lang) ? lang : 'en';
  return current;
}

/** @returns {string} the current language code */
export function getLanguage() {
  return current;
}

/**
 * Looks up a string in the current language and fills its {placeholders}.
 * @param {string} key
 * @param {Object<string, (string|number)>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  const template = DICTIONARIES[current][key] ?? EN[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Human-readable text for a parse error, with a 1-based position.
 * @param {{code: string, pos: number, detail?: string}} error a ParseError or its plain copy
 * @returns {string}
 */
export function errorText(error) {
  return t(`error.${error.code}`, { pos: error.pos + 1, detail: error.detail ?? '', max: MAX_EXPRESSION_LENGTH });
}
