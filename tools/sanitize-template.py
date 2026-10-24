"""Create the fixed public template. Never modify the private source ODS.

Explicit cell/range rules clear the source case's data. Styles and geometry stay
byte-for-byte intact. The two location maps are replaced with empty images.
Run locally after preparing .local/fields.json from src/schema.ts.
"""
import pathlib, json, re, zipfile, io, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else next(ROOT.glob('*.ods'))
fields = set(json.loads((ROOT/'.local/fields.json').read_text(encoding='utf-8')))
rules = {
    'INFORMACION GENERAL': fields | {'D83'},
    'VARIABLE': {'C6', 'C10', 'F6', 'F7'},
    'FIJA': {'C6', 'C10', 'F6', 'F7'},
    'CALCULO DE CUOTA': {'C4', 'L3', 'E7', 'B10', 'E10'},
    'SOLICITUD': {'F160', 'AD160'},
    'INDICE': {'C5'},
    'CROQUIS 1': {'BT5', 'AY16', 'B33', 'B48', 'B76', 'AX79', 'AX80', 'AX81', 'AX82', 'B96', 'AX99'},
    'CROQUIS 2': {'S10', 'AW10', 'BD10', 'AY13', 'AY16', 'AY36', 'B76', 'B96'},
    'CROQUIS GTE': {'B13', 'AY15', 'AY35', 'B76', 'AY78', 'AY98'},
    'CARTA ABONO EN CTA': {'I24'},
    'CARTA SEG. DESG.': {'C32', 'C87'},
    'CARTA DEBITO': {'O35'},
    'DEC. JUR.  SALUD': {'F17', 'T17', 'F19', 'R19', 'Z19', 'F24', 'M24', 'V24', 'F32', 'Q32', 'AC32', 'F35', 'Q35', 'AC35'},
    'MANT VEH': {'C7', 'F7', 'C8', 'F8', 'C9'} | {f'{c}{r}' for c in ['E','F'] for r in range(12,28)},
    'INVENTARIO': {f'{c}{r}' for c in ['B','C','D','E','F'] for r in range(17,63)},
    'FICHA SOC.': {f'{c}{r}' for c in ['AK','AM','AO'] for r in range(8,31)},
}
for name in ['DPJ GTE', 'DPJ GARANTE']:
    rules[name] = {'G9','Y9','M29'} | {f'{c}{r}' for c in ['AE','AI'] for r in range(14,112)}
    rules[name] -= {'AE68','AI68','AI69','AE100','AI100','AI101'}
    for lo,hi in [(14,22),(23,28),(31,39),(41,51),(53,65),(70,78),(80,88),(89,97),(102,112)]:
        rules[name] |= {f'{c}{r}' for c in ['A','U','Z'] for r in range(lo,hi)}
def col(n):
    s=''
    while n: n,r=divmod(n-1,26);s=chr(65+r)+s
    return s
def clear(raw, formula=False):
    raw = re.sub(r'\s+(?:office:(?:value-type|value|date-value|string-value|boolean-value|currency)|calcext:value-type)="[^"]*"','',raw)
    raw = re.sub(r'<text:p\b[^>]*?(?:/>|>[\s\S]*?</text:p>)','',raw)
    return raw
cleared=[]
def sheet_edit(m):
    raw=m.group(); name=re.search(r'table:name="([^"]+)"',raw).group(1)
    rn=1
    def row_edit(rm):
        nonlocal rn
        row=rm.group(); cn=1
        rr=int((re.search(r'table:number-rows-repeated="(\d+)"',row[:row.index('>')+1]) or [None,'1'])[1])
        def cell_edit(cm):
            nonlocal cn
            cell=cm.group(); head=cell[:cell.index('>')+1]
            cr=int((re.search(r'table:number-columns-repeated="(\d+)"',head) or [None,'1'])[1])
            address=col(cn)+str(rn);cn+=cr
            # Every formula cache is cleared; formulas themselves remain untouched.
            # Case-specific validation choices and assessment marks are also blank.
            personal = address in rules.get(name,set()) or (name == 'INDICE' and address.startswith('D') and 'table:content-validation-name' in head)
            if 'table:formula=' in head or personal:
                if personal: cleared.append(name+'!'+address)
                return clear(cell)
            return cell
        row=re.sub(r'<table:(table-cell|covered-table-cell)(?=[\s/>])[^>]*?(?:/>|>[\s\S]*?</table:\1>)',cell_edit,row)
        rn+=rr
        return row
    return re.sub(r'<table:table-row(?=[\s/>])[^>]*?(?:/>|>[\s\S]*?</table:table-row>)',row_edit,raw)
with zipfile.ZipFile(SOURCE) as zin:
    entries={n:zin.read(n) for n in zin.namelist()}
xml=entries['content.xml'].decode('utf8')
xml=re.sub(r'<table:table(?=[\s>])[^>]*>[\s\S]*?</table:table>',sheet_edit,xml)
# Remove comments/author information and drawing text boxes that may retain case notes.
xml=re.sub(r'<office:annotation\b[^>]*>[\s\S]*?</office:annotation>','',xml)
# Clear explicit drawing titles/descriptions (including alternative image labels).
xml=re.sub(r'<svg:(title|desc)\b[^>]*>[\s\S]*?</svg:\1>','',xml)
entries['content.xml']=xml.encode('utf8')
entries['meta.xml']=b'<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:meta/></office:document-meta>'
for name in entries:
    if name.startswith('Pictures/') and ('14414E2EE7C' in name or '2C8D8480F75' in name):
        old=Image.open(io.BytesIO(entries[name])); new=Image.new('RGB',old.size,'white'); out=io.BytesIO();new.save(out,format='PNG' if name.endswith('.png') else 'JPEG');entries[name]=out.getvalue()
    if name=='Thumbnails/thumbnail.png':
        out=io.BytesIO();Image.new('RGB',(256,256),'white').save(out,format='PNG');entries[name]=out.getvalue()
    if name.endswith('settings.xml'):
        text=entries[name].decode('utf8'); text=re.sub(r'<config:config-item config:name="(Author|UserName|UserFirstName|UserLastName|UserId)"[^>]*>[^<]*</config:config-item>',r'',text);entries[name]=text.encode('utf8')
destination=ROOT/'public/plantilla.ods'
with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED) as zout:
    zout.writestr('mimetype',entries.pop('mimetype'),compress_type=zipfile.ZIP_STORED)
    for name,data in entries.items():zout.writestr(name,data)
(ROOT/'.local/sanitized-cells.json').write_text(json.dumps(cleared,indent=2),encoding='utf8')
print('Plantilla fija creada:',len(cleared),'celdas limpiadas;',destination.stat().st_size,'bytes.')
