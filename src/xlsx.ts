import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { GENERAL, type Template } from './ods';
import { allFields } from './schema';

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const dec = (s: string) => s.replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const attr = (s: string, name: string) => dec(s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');

/** Fill the native Excel template; keep its styles, images, formulas and print setup. */
export function generateXLSX(bytes: Uint8Array, filled: Template): Uint8Array {
  const entries = unzipSync(bytes);
  if (!entries['xl/workbook.xml'] || !entries['xl/_rels/workbook.xml.rels']) throw new Error('La plantilla de Excel no es válida.');
  const rels = strFromU8(entries['xl/_rels/workbook.xml.rels']);
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const workbook = strFromU8(entries['xl/workbook.xml']);
  const inputAddresses = new Set(allFields.map(f => f.cell));
  const sheetFiles = [...workbook.matchAll(/<sheet\s[^>]*\/>/g)].map(m => {
    const target = targets.get(attr(m[0], 'r:id'));
    if (!target) throw new Error('Falta una hoja en la plantilla de Excel.');
    return { name: attr(m[0], 'name'), path: target.startsWith('/') ? target.slice(1) : 'xl/' + target };
  });
  if (sheetFiles.length !== filled.sheets.length) throw new Error('Las plantillas ODS y Excel deben tener las mismas hojas.');
  for (const sheet of sheetFiles) {
    const updates = new Map([...filled.cells.values()].filter(c => c.sheet === sheet.name && (c.formula || (c.sheet === GENERAL && inputAddresses.has(c.address)))).map(c => [c.address, c.value]));
    if (!updates.size) continue;
    const source = entries[sheet.path]; if (!source) throw new Error(`No se encontró ${sheet.name} en Excel.`);
    const xml = strFromU8(source).replace(/<c(?=[\s>])[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, raw => {
      const address = attr(raw.slice(0, raw.indexOf('>') + 1), 'r');
      if (!updates.has(address)) return raw;
      const value = updates.get(address)!; updates.delete(address);
      const hasFormula = /<f(?:\s|>|\/)/.test(raw);
      let result = raw.replace(/^<c\b[^>]*>/, head => head.replace(/\s+t="[^"]*"/g, '')).replace(/<v(?:\s[^>]*?)?(?:\/>|>[\s\S]*?<\/v>)/g, '').replace(/<is(?:\s[^>]*?)?>[\s\S]*?<\/is>/g, '');
      if (result.endsWith('/>')) result = result.slice(0, -2) + '></c>';
      let content = '';
      if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`Valor inválido en ${sheet.name}!${address}`); content = `<v>${value}</v>`; }
      else if (typeof value === 'boolean') { result = result.replace('>', ' t="b">'); content = `<v>${value ? 1 : 0}</v>`; }
      else if (hasFormula) { result = result.replace('>', ' t="str">'); content = `<v>${esc(String(value))}</v>`; }
      else if (value !== '') { result = result.replace('>', ' t="inlineStr">'); content = `<is><t xml:space="preserve">${esc(String(value))}</t></is>`; }
      return result.replace('</c>', content + '</c>');
    });
    if (updates.size) throw new Error(`Faltan celdas en Excel: ${sheet.name} ${[...updates.keys()].slice(0, 4).join(', ')}.`);
    entries[sheet.path] = strToU8(xml);
  }
  const calcAttrs = 'calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"';
  entries['xl/workbook.xml'] = strToU8(/<calcPr\b/.test(workbook) ? workbook.replace(/<calcPr\b[^>]*\/>/, `<calcPr ${calcAttrs}/>`): workbook.replace('</workbook>', `<calcPr ${calcAttrs}/></workbook>`));
  return zipSync(entries, { level: 6 });
}
