import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from 'fflate';
import { allFields, emptyForm, type FormData } from './schema';

const MIME = 'application/vnd.oasis.opendocument.spreadsheet';
export const GENERAL = 'INFORMACION GENERAL';
type Value = string | number | boolean;
type Cell = { key: string; sheet: string; address: string; start: number; end: number; xml: string; repeat: number; offset: number; value: Value; formula?: string; date: boolean };
export type Template = { bytes: Uint8Array; entries: Record<string, Uint8Array>; xml: string; cells: Map<string, Cell>; sheets: { name: string; formulas: number }[]; form: FormData; formulaCount: number; imageCount: number };
const key = (sheet: string, address: string) => `${sheet}!${address.replaceAll('$', '')}`;
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function decode(s: string) { return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, c: string) => c[0] === '#' ? String.fromCodePoint(c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : Number(c.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[c] ?? '')); }
const attr = (s: string, name: string) => decode(s.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? '');
const letters = (n: number): string => n > 26 ? letters(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + (n - 1) % 26) : String.fromCharCode(64 + n);
const epoch = Date.UTC(1899, 11, 30);
const serial = (iso: string) => (Date.parse(iso.slice(0, 10) + 'T00:00:00Z') - epoch) / 86400000;
const isoDate = (v: number) => new Date(epoch + v * 86400000).toISOString().slice(0, 10);
function textValue(xml: string) {
  return [...xml.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map(m => decode(m[1].replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => ' '.repeat(Math.min(Number(n || 1), 1000))).replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n').replace(/<[^>]+>/g, ''))).join('\n');
}
export function readTemplate(bytes: Uint8Array): Template {
  if (bytes.length > 15_000_000) throw new Error('La plantilla supera el límite de 15 MB.');
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(bytes); } catch { throw new Error('El archivo no es un ODS válido.'); }
  if (!entries.mimetype || strFromU8(entries.mimetype) !== MIME || !entries['content.xml']) throw new Error('Selecciona un archivo de hoja de cálculo .ods.');
  if (Object.values(entries).reduce((n, e) => n + e.length, 0) > 60_000_000) throw new Error('La plantilla descomprimida es demasiado grande.');
  const xml = strFromU8(entries['content.xml']);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('La plantilla contiene declaraciones XML no admitidas.');
  const cells = new Map<string, Cell>();
  const sheets: Template['sheets'] = [];
  const generalAddresses = new Set(allFields.map(f => f.cell));
  for (const table of xml.matchAll(/<table:table(?=[\s>])[^>]*>[\s\S]*?<\/table:table>/g)) {
    const name = attr(table[0].slice(0, table[0].indexOf('>')), 'table:name');
    const sheet = { name, formulas: 0 }; sheets.push(sheet);
    let rn = 1;
    for (const row of table[0].matchAll(/<table:table-row(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/table:table-row>)/g)) {
      const rowRepeat = Number(attr(row[0].slice(0, row[0].indexOf('>') + 1), 'table:number-rows-repeated') || 1);
      let cn = 1;
      for (const match of row[0].matchAll(/<table:(table-cell|covered-table-cell)(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/table:\1>)/g)) {
        const raw = match[0]; const head = raw.slice(0, raw.indexOf('>') + 1);
        const repeat = Number(attr(head, 'table:number-columns-repeated') || 1);
        const formula = attr(head, 'table:formula') || undefined;
        if (formula) sheet.formulas += rowRepeat * repeat;
        const type = attr(head, 'office:value-type');
        const isDate = type === 'date';
        const value: Value = isDate ? serial(attr(head, 'office:date-value')) : type === 'float' || type === 'percentage' || type === 'currency' ? Number(attr(head, 'office:value')) : type === 'boolean' ? attr(head, 'office:boolean-value') === 'true' : textValue(raw);
        if (rn <= 300 && cn <= 100) for (let offset = 0; offset < Math.min(repeat, 101 - cn); offset++) {
          const address = letters(cn + offset) + rn;
          if (formula || value !== '' || (name === GENERAL && generalAddresses.has(address))) {
            const k = key(name, address);
            cells.set(k, { key: k, sheet: name, address, start: table.index! + row.index! + match.index!, end: table.index! + row.index! + match.index! + raw.length, xml: raw, repeat, offset, value, formula, date: isDate });
          }
        }
        cn += repeat;
      }
      rn += rowRepeat;
    }
  }
  if (!sheets.some(s => s.name === GENERAL) || !cells.has(key(GENERAL, 'J2')) || !cells.has(key(GENERAL, 'J80'))) throw new Error('La plantilla debe contener INFORMACION GENERAL con la estructura del documento original.');
  for (const f of allFields) if (!cells.has(key(GENERAL, f.cell))) throw new Error(`No se encontró la celda ${f.cell} en INFORMACION GENERAL.`);
  const form = emptyForm();
  for (const f of allFields) {
    const c = cells.get(key(GENERAL, f.cell))!;
    form[f.cell] = f.type === 'date' && typeof c.value === 'number' ? isoDate(c.value) : String(c.value);
  }
  return { bytes, entries, xml, cells, sheets, form, formulaCount: sheets.reduce((n, s) => n + s.formulas, 0), imageCount: Object.keys(entries).filter(n => n.startsWith('Pictures/')).length };
}

type Expr = { type: 'value'; value: Value } | { type: 'ref'; ref: string } | { type: 'fn'; name: string; args: Expr[] } | { type: 'op'; op: string; a: Expr; b: Expr };
// Small, non-eval parser for the document's linked fields. Financial schedules stay in Calc.
function parseFormula(formula: string): Expr {
  const s = formula.replace(/^of:=/, ''); let pos = 0;
  const skip = () => { while (/\s/.test(s[pos] || '') && pos < s.length) pos++; };
  function atom(): Expr {
    skip();
    if (s[pos] === '[') { const end = s.indexOf(']', pos); if (end < 0) throw new Error('Referencia incompleta'); const ref = s.slice(pos + 1, end); pos = end + 1; return { type: 'ref', ref }; }
    if (s[pos] === '"') { pos++; let value = ''; while (pos < s.length) { if (s[pos] === '"') { if (s[pos + 1] === '"') { value += '"'; pos += 2; } else { pos++; return { type: 'value', value }; } } else value += s[pos++]; } throw new Error('Texto incompleto'); }
    if (s[pos] === '(') { pos++; const a = expr(0); skip(); if (s[pos++] !== ')') throw new Error('Paréntesis incompleto'); return a; }
    if (s[pos] === '-') { pos++; return { type: 'op', op: '*', a: { type: 'value', value: -1 }, b: atom() }; }
    const n = s.slice(pos).match(/^\d+(?:\.\d+)?/); if (n) { pos += n[0].length; return { type: 'value', value: Number(n[0]) }; }
    const fn = s.slice(pos).match(/^([A-Z]+)\(/); if (fn) { pos += fn[0].length; const args: Expr[] = []; skip(); if (s[pos] !== ')') { while (true) { args.push(expr(0)); skip(); if (s[pos] !== ';') break; pos++; } } if (s[pos++] !== ')') throw new Error('Función incompleta'); return { type: 'fn', name: fn[1], args }; }
    throw new Error(`Expresión no admitida: ${s.slice(pos, pos + 25)}`);
  }
  const prec: Record<string, number> = { '=': 1, '<>': 1, '>': 1, '<': 1, '>=': 1, '<=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  function expr(min: number): Expr { let a = atom(); while (true) { skip(); const op = s.slice(pos).match(/^(<>|>=|<=|[=><&+*/^\-])/ )?.[0]; if (!op || prec[op] < min) break; pos += op.length; a = { type: 'op', op, a, b: expr(prec[op] + 1) }; } return a; }
  const result = expr(0); skip(); if (pos !== s.length) throw new Error('Fórmula no admitida'); return result;
}
function reference(ref: string, current: string) {
  const m = ref.match(/^(?:'((?:[^']|'')+)'|([^'.]+))?\.([\w$]+)$/);
  if (!m) throw new Error(`Referencia no admitida: ${ref}`);
  return key((m[1]?.replaceAll("''", "'") ?? m[2]) || current, m[3]);
}
function calc(expr: Expr, sheet: string, get: (key: string) => Value): Value {
  const ev = (e: Expr) => calc(e, sheet, get);
  if (expr.type === 'value') return expr.value;
  if (expr.type === 'ref') return get(reference(expr.ref, sheet));
  if (expr.type === 'fn') {
    if (expr.name === 'IF') return ev(expr.args[0]) ? ev(expr.args[1]) : ev(expr.args[2]);
    const args = expr.args.map(ev);
    if (expr.name === 'AND') return args.every(Boolean);
    if (expr.name === 'CONCATENATE') return args.join('');
    const date = new Date(epoch + Number(args[0]) * 86400000);
    if (expr.name === 'DAY') return date.getUTCDate();
    if (expr.name === 'MONTH') return date.getUTCMonth() + 1;
    if (expr.name === 'YEAR') return date.getUTCFullYear();
    throw new Error(`Función vinculada no admitida: ${expr.name}`);
  }
  const a = ev(expr.a), b = ev(expr.b), an = Number(a), bn = Number(b);
  switch (expr.op) {
    case '&': return String(a) + String(b);
    case '+': return an + bn; case '-': return an - bn; case '*': return an * bn; case '/': if (bn === 0) throw new Error('División por cero'); return an / bn; case '^': return an ** bn;
  }
  const aa = typeof a === 'string' ? a.toLocaleUpperCase('es') : a;
  const bb = typeof b === 'string' ? b.toLocaleUpperCase('es') : b;
  const equal = aa === bb || (a === '' && b === 0) || (a === 0 && b === '');
  // Calc orders nonempty strings after numbers in mixed-type comparisons.
  const cmp = equal ? 0 : typeof aa === 'string' && typeof bb === 'number' ? (aa === '' ? Math.sign(-bb) : 1) : typeof bb === 'string' && typeof aa === 'number' ? (bb === '' ? Math.sign(aa) : -1) : aa > bb ? 1 : -1;
  switch (expr.op) { case '=': return equal; case '<>': return !equal; case '>': return cmp > 0; case '<': return cmp < 0; case '>=': return cmp >= 0; case '<=': return cmp <= 0; }
  throw new Error('Operador no admitido');
}
function cellXML(c: Cell, value: Value, fieldType?: string) {
  const tag = c.xml.startsWith('<table:covered-table-cell') ? 'covered-table-cell' : 'table-cell';
  let raw = c.xml.replace(/\s+(?:office:(?:value-type|value|date-value|string-value|boolean-value|currency)|calcext:value-type)="[^"]*"/g, '').replace(/\s+table:number-columns-repeated="[^"]*"/g, '');
  raw = raw.replace(/<text:p\b[^>]*(?:\/>|>[\s\S]*?<\/text:p>)/g, '');
  if (raw.endsWith('/>')) raw = raw.slice(0, -2) + `></table:${tag}>`;
  let attrs = '', display = String(value);
  if (value !== '') {
    if (fieldType === 'date' || (c.date && typeof value === 'number')) { const iso = typeof value === 'number' ? isoDate(value) : String(value); attrs = ` office:value-type="date" office:date-value="${iso}"`; display = iso.split('-').reverse().join('/'); }
    else if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`Resultado no válido en ${c.key}`); attrs = ` office:value-type="float" office:value="${value}"`; }
    else if (typeof value === 'boolean') attrs = ` office:value-type="boolean" office:boolean-value="${value}"`;
    else attrs = ' office:value-type="string"';
  }
  raw = raw.replace('>', attrs + '>');
  // Keep original paragraph style for wrapping and alignment.
  const paragraphAttrs = c.xml.match(/<text:p\b([^>]*)>/)?.[1] ?? '';
  return raw.replace(`</table:${tag}>`, (value === '' ? '' : `<text:p${paragraphAttrs}>${escape(display).replaceAll('\n', '<text:line-break/>')}</text:p>`) + `</table:${tag}>`);
}
function repeatXML(xml: string, count: number) {
  const raw = xml.replace(/\s+table:number-columns-repeated="[^"]*"/g, '');
  return count === 1 ? raw : raw.replace(/^(<table:[\w-]+)/, `$1 table:number-columns-repeated="${count}"`);
}
export function generateODS(template: Template, data: FormData) {
  const changes = new Map<string, Value>();
  for (const f of allFields) {
    const value = data[f.cell] ?? '';
    const v = value === '' ? '' : f.type === 'date' ? serial(value) : f.type === 'number' ? Number(value) : value;
    // Equal displayed values keep their original storage type and XML.
    if (value !== template.form[f.cell]) changes.set(key(GENERAL, f.cell), v);
  }
  const affected = new Set(changes.keys());
  const formulas = [...template.cells.values()].filter(c => c.formula);
  let grew = true;
  while (grew) { grew = false; for (const c of formulas) if (!affected.has(c.key)) {
    const refs = [...c.formula!.matchAll(/\[([^\]]+)\]/g)];
    if (refs.some(r => { try { return affected.has(reference(r[1], c.sheet)); } catch { return false; } })) { affected.add(c.key); grew = true; }
  } }
  const evaluating = new Set<string>();
  function get(k: string): Value {
    if (changes.has(k)) return changes.get(k)!;
    const c = template.cells.get(k); if (!c) return 0;
    if (!c.formula || !affected.has(k)) return c.value;
    if (evaluating.has(k)) throw new Error(`Dependencia circular en ${k}`);
    evaluating.add(k);
    let v: Value;
    try { v = calc(parseFormula(c.formula), c.sheet, get); } catch (e) { throw new Error(`No se pudo actualizar ${k}: ${(e as Error).message}`); }
    evaluating.delete(k); changes.set(k, v); return v;
  }
  for (const k of affected) get(k);
  // Multiple edited cells may occupy the same repeated XML node.
  const groups = new Map<number, { cell: Cell; edits: Map<number, string> }>();
  for (const [k, value] of changes) {
    const c = template.cells.get(k)!;
    const group = groups.get(c.start) ?? { cell: c, edits: new Map() };
    group.edits.set(c.offset, cellXML(c, value, allFields.find(f => k === key(GENERAL, f.cell))?.type)); groups.set(c.start, group);
  }
  let xml = template.xml;
  for (const [start, { cell: c, edits }] of [...groups].sort((a, b) => b[0] - a[0])) {
    let replacement = '', previous = 0;
    for (const [offset, text] of [...edits].sort((a, b) => a[0] - b[0])) { if (offset > previous) replacement += repeatXML(c.xml, offset - previous); replacement += text; previous = offset + 1; }
    if (previous < c.repeat) replacement += repeatXML(c.xml, c.repeat - previous);
    xml = xml.slice(0, start) + replacement + xml.slice(c.end);
  }
  const entries: Zippable = { mimetype: [strToU8(MIME), { level: 0 }] };
  for (const [name, bytes] of Object.entries(template.entries)) if (name !== 'mimetype') entries[name] = name === 'content.xml' ? strToU8(xml) : bytes;
  const bytes = zipSync(entries, { level: 6 });
  return { bytes, updatedInputs: [...changes.keys()].filter(k => k.startsWith(GENERAL + '!')).length, updatedLinks: changes.size - [...changes.keys()].filter(k => k.startsWith(GENERAL + '!')).length };
}
export function download(bytes: Uint8Array, filename: string, type = MIME) {
  const blob = new Blob([new Uint8Array(bytes)], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
