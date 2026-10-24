import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import { generateODS, readTemplate, GENERAL } from '../src/ods';
import { allFields, emptyForm, fieldError } from '../src/schema';

const source = new Uint8Array(fs.readFileSync('public/plantilla.ods'));
const original = readTemplate(source);
const tableNS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
function xmlDocument(bytes: Uint8Array) {
  const errors: string[] = [];
  const xml = strFromU8(unzipSync(bytes)['content.xml']);
  const doc = new DOMParser({ errorHandler: { warning: m => errors.push(m), error: m => errors.push(m), fatalError: m => errors.push(m) } }).parseFromString(xml, 'text/xml');
  assert.deepEqual(errors, [], 'El ODS debe contener XML válido');
  return doc;
}
function invariant(bytes: Uint8Array) {
  const output = readTemplate(bytes);
  const entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries).sort(), Object.keys(original.entries).sort());
  for (const name of Object.keys(original.entries)) if (name !== 'content.xml') assert.deepEqual(entries[name], original.entries[name], `Recurso preservado: ${name}`);
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset).getUint16(8, true), 0, 'mimetype debe ir sin compresión');
  assert.equal(strFromU8(bytes.slice(30, 38)), 'mimetype', 'mimetype debe ser la primera entrada');
  assert.deepEqual(output.sheets, original.sheets);
  assert.equal(output.formulaCount, original.formulaCount);
  for (const [key, cell] of original.cells) {
    const after = output.cells.get(key);
    assert.equal(after?.formula, cell.formula, `Fórmula preservada en ${key}`);
    if (after) assert.equal(after.xml.match(/table:style-name="[^"]*"/)?.[0], cell.xml.match(/table:style-name="[^"]*"/)?.[0], `Estilo preservado en ${key}`);
  }
  const beforeDoc = xmlDocument(source), afterDoc = xmlDocument(bytes);
  for (const name of ['table', 'table-row', 'table-column']) {
    const beforeNodes = beforeDoc.getElementsByTagNameNS(tableNS, name);
    const afterNodes = afterDoc.getElementsByTagNameNS(tableNS, name);
    const before = Array.from({ length: beforeNodes.length }, (_, i) => {
      const e = beforeNodes.item(i)!; return Array.from({ length: e.attributes.length }, (_, j) => { const a = e.attributes.item(j)!; return [a.name, a.value]; });
    });
    const after = Array.from({ length: afterNodes.length }, (_, i) => {
      const e = afterNodes.item(i)!; return Array.from({ length: e.attributes.length }, (_, j) => { const a = e.attributes.item(j)!; return [a.name, a.value]; });
    });
    assert.deepEqual(after, before, `Configuración estructural preservada: ${name}`);
  }
  const merged = (xml: string) => [...xml.matchAll(/table:number-(?:columns|rows)-spanned="\d+"/g)].map(m => m[0]);
  assert.deepEqual(merged(output.xml), merged(original.xml));
  return output;
}
test('interpreta las 23 hojas y mapea todos los campos a celdas reales', () => {
  assert.equal(original.sheets.length, 23);
  assert.equal(original.imageCount, 9);
  assert.equal(new Set(allFields.map(f => f.cell)).size, allFields.length);
  assert.ok(allFields.length > 140);
  for (const f of allFields) { const c = original.cells.get(`${GENERAL}!${f.cell}`); assert.ok(c, f.cell); }
});
test('exportar sin cambios conserva content.xml y todos los recursos', () => {
  const output = generateODS(original, original.form);
  assert.equal(output.updatedInputs, 0);
  assert.equal(output.updatedLinks, 0);
  assert.deepEqual(unzipSync(output.bytes)['content.xml'], original.entries['content.xml']);
  invariant(output.bytes);
});
test('nombre, CI, fecha y monto se propagan sin alterar el diseño', () => {
  const form = { ...original.form, J2: 'PRUEBA & <NUEVO> "CLIENTE"', J3: '0012345 LP', J4: '1990-12-28', J27: '88000.50', J5: 'Casado', J78: '2026-10-23', J80: '000001' };
  const result = generateODS(original, form);
  const out = invariant(result.bytes);
  assert.equal(out.form.J2, form.J2);
  assert.equal(out.form.J3, '0012345 LP');
  assert.equal(out.form.J4, '1990-12-28');
  assert.equal(out.cells.get('SOLICITUD!G9')?.value, form.J2);
  assert.equal(out.cells.get('SOLICITUD!AC9')?.value, '0012345 LP');
  assert.equal(out.cells.get('SOLICITUD!I54')?.value, 88000.5);
  assert.equal(out.cells.get('DEC. CIVIL!Z10')?.value, 'X');
  assert.equal(out.cells.get('CARTA DEBITO!K6')?.value, 23);
  assert.equal(out.cells.get('CARTA DEBITO!Q6')?.value, 2026);
  assert.ok(result.updatedLinks > 20);
  assert.equal(out.cells.get('CALCULO DE CUOTA!C4')?.value, original.cells.get('CALCULO DE CUOTA!C4')?.value, 'El cálculo independiente conserva sus entradas');
});
test('editar todos los campos, incluidos los vacíos repetidos, conserva coordenadas y recursos', () => {
  const form = Object.fromEntries(allFields.map(f => [f.cell, f.type === 'date' ? '1991-01-17' : f.type === 'number' ? f.cell === 'J29' ? '15' : '1250.75' : f.options?.[0] || `Dato ${f.cell} & prueba` ]));
  const out = invariant(generateODS(original, form).bytes);
  for (const f of allFields) assert.equal(out.form[f.cell], form[f.cell], f.cell);
});
test('vaciar formulario borra los datos generales y sus vínculos conservando contenidos manuales', () => {
  const out = invariant(generateODS(original, emptyForm()).bytes);
  for (const f of allFields) assert.equal(out.form[f.cell], '', f.cell);
  assert.equal(out.cells.get('SOLICITUD!G9')?.value ?? '', '');
  assert.equal(out.cells.get('DPJ GARANTE!G9')?.value, original.cells.get('DPJ GARANTE!G9')?.value);
});
test('valida datos necesarios, límites numéricos y formatos incorrectos', () => {
  for (const f of allFields.filter(f => f.required)) assert.ok(fieldError(f, ''));
  const day = allFields.find(f => f.cell === 'J29')!;
  assert.ok(fieldError(day, '32')); assert.ok(fieldError(day, '0')); assert.equal(fieldError(day, '15'), '');
  const amount = allFields.find(f => f.cell === 'J27')!;
  assert.ok(fieldError(amount, '-1')); assert.ok(fieldError(amount, 'NaN')); assert.ok(fieldError(amount, '0')); assert.equal(fieldError(amount, '105000'), '');
  assert.throws(() => readTemplate(new Uint8Array([1, 2, 3])), /ODS válido/);
});

test('la plantilla pública no contiene los datos personales del archivo de origen', () => {
  for (const f of allFields) assert.equal(original.form[f.cell], '', f.cell);
  const privateFile = fs.readdirSync('.').find(f => f.endsWith('.ods'));
  const privateTemplate = privateFile ? readTemplate(new Uint8Array(fs.readFileSync(privateFile))) : null;
  const identityCells = ['J2','J3','J8','J38','J62','J66','J71','J72','J76','J80','J81','AH29','AH30','AH35','AH45','AH46','AH51'];
  const forbidden = privateTemplate ? identityCells.map(cell => privateTemplate.form[cell]).filter(Boolean) : [];
  for (const [name, entry] of Object.entries(original.entries)) if (/\.(xml|rdf)$/.test(name) && entry.length) {
    const xml = strFromU8(entry);
    const text = new DOMParser().parseFromString(xml, 'text/xml').documentElement.textContent || '';
    for (const value of forbidden) assert.ok(!text.toUpperCase().includes(value.toUpperCase()), `Un dato privado no debe aparecer en ${name}`);
  }
});
