import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import { generateXLSX } from '../src/xlsx';
import { generateODS, readTemplate } from '../src/ods';
import { allFields } from '../src/schema';

const xlsx = new Uint8Array(fs.readFileSync('public/plantilla.xlsx'));
const ods = readTemplate(new Uint8Array(fs.readFileSync('public/plantilla.ods')));
const source = unzipSync(xlsx);
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function document(xml: Uint8Array) {
  const errors: string[] = [];
  const doc = new DOMParser({ errorHandler: { warning: e => errors.push(e), error: e => errors.push(e), fatalError: e => errors.push(e) } }).parseFromString(strFromU8(xml), 'text/xml');
  assert.deepEqual(errors, []);
  return doc;
}
function cell(entries: Record<string, Uint8Array>, sheet: number, address: string) {
  const doc = document(entries[`xl/worksheets/sheet${sheet}.xml`]);
  const cells = doc.getElementsByTagNameNS(ns, 'c');
  for (let i = 0; i < cells.length; i++) if (cells.item(i)!.getAttribute('r') === address) return cells.item(i)!;
  throw new Error(address);
}
test('Excel exporta todas las entradas y las fórmulas vinculadas sin reconstruir los estilos', () => {
  const form = Object.fromEntries(allFields.map(f => [f.cell, f.type === 'date' ? '1992-07-28' : f.type === 'number' ? f.cell === 'J29' ? '15' : '1800.75' : f.options?.[0] || `Prueba ${f.cell} & <dato>` ]));
  form.J3 = '0012345 LP'; form.J2 = '=NOMBRE LITERAL';
  const filled = readTemplate(generateODS(ods, form).bytes);
  const bytes = generateXLSX(xlsx, filled);
  const result = unzipSync(bytes);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(source).sort());
  for (const [name, entry] of Object.entries(source)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name) && name !== 'xl/workbook.xml') assert.deepEqual(result[name], entry, name);
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      document(result[name]);
      const before = strFromU8(entry), after = strFromU8(result[name]);
      for (const tag of ['mergeCells','cols','pageMargins','pageSetup','drawing','headerFooter']) {
        const pattern = new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`, 'g');
        assert.deepEqual(after.match(pattern), before.match(pattern), `${name} ${tag}`);
      }
      assert.deepEqual(after.match(/<f(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/f>)/g), before.match(/<f(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/f>)/g), `Fórmulas: ${name}`);
      assert.deepEqual(after.match(/\bs="\d+"/g), before.match(/\bs="\d+"/g), `Estilos: ${name}`);
    }
  }
  assert.equal(document(result['xl/workbook.xml']).getElementsByTagNameNS(ns, 'sheet').length, 23);
  assert.equal(cell(result, 1, 'J3').textContent, '0012345 LP');
  assert.equal(cell(result, 1, 'J2').getElementsByTagNameNS(ns, 'f').length, 0);
  assert.equal(cell(result, 1, 'J2').textContent, '=NOMBRE LITERAL');
  assert.equal(cell(result, 1, 'J27').textContent, '1800.75');
  assert.equal(cell(result, 5, 'G9').getElementsByTagNameNS(ns, 'v').item(0)?.textContent, '=NOMBRE LITERAL');
  assert.ok(strFromU8(result['xl/workbook.xml']).includes('fullCalcOnLoad="1"'));
});
test('las plantillas públicas y sus recursos no exponen rutas del equipo ni el expediente privado', () => {
  for (const [name, entry] of Object.entries(source)) if (name.endsWith('.xml')) {
    const text = strFromU8(entry);
    assert.ok(!text.includes('C:\\Users\\'), `Ruta local en ${name}`);
    assert.ok(!text.includes('conversion.ods'), name);
  }
  const privateFile = fs.readdirSync('.').find(f => f.endsWith('.ods'));
  if (!privateFile) return;
  const original = readTemplate(new Uint8Array(fs.readFileSync(privateFile)));
  const privateValues = ['J2','J3','J8','J38','AH29','AH30','AH45','AH46'].map(c => original.form[c]).filter(Boolean);
  for (const [name, entry] of Object.entries(source)) if (name.endsWith('.xml')) for (const value of privateValues) assert.ok(!strFromU8(entry).includes(value), `Dato privado en ${name}`);
});
