import zipfile, xml.etree.ElementTree as ET, json, pathlib, hashlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else next(ROOT.glob('*.ods'))
NS = {'t':'urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'x':'urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'o':'urn:oasis:names:tc:opendocument:xmlns:office:1.0'}
def col(n):
    s=''
    while n:
        n,r=divmod(n-1,26); s=chr(65+r)+s
    return s
with zipfile.ZipFile(SOURCE) as z:
    root = ET.fromstring(z.read('content.xml'))
    result={'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'entries':[{'name':i.filename,'size':i.file_size} for i in z.infolist()], 'sheets':[]}
    for table in root.findall('.//t:table',NS):
        sheet={'name':table.get('{'+NS['t']+'}name'),'attrs':table.attrib, 'cells':[],'formulas':0,'merges':0,'rows':0}
        rn=1
        for row in table.findall('t:table-row',NS):
            repeat=int(row.get('{'+NS['t']+'}number-rows-repeated','1'))
            cn=1
            for cell in row:
                if cell.tag not in ('{'+NS['t']+'}table-cell','{'+NS['t']+'}covered-table-cell'): continue
                cr=int(cell.get('{'+NS['t']+'}number-columns-repeated','1'))
                text='\n'.join(''.join(p.itertext()) for p in cell.findall('x:p',NS))
                formula=cell.get('{'+NS['t']+'}formula')
                if formula: sheet['formulas']+=repeat*cr
                if cell.get('{'+NS['t']+'}number-columns-spanned'): sheet['merges']+=1
                if text or formula:
                    sheet['cells'].append({'cell':col(cn)+str(rn),'text':text,'formula':formula,'repeat':cr,'rowRepeat':repeat,'type':cell.get('{'+NS['o']+'}value-type'),'style':cell.get('{'+NS['t']+'}style-name')})
                cn+=cr
            rn+=repeat
        sheet['rows']=rn-1
        result['sheets'].append(sheet)
    out=ROOT/'docs'; out.mkdir(exist_ok=True)
    (out/'ods-analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('SHA256',result['sha256'])
    print('ARCHIVE',len(result['entries']),'entries')
    for s in result['sheets']:
        print('\nSHEET',s['name'],'FORMULAS',s['formulas'],'MERGES',s['merges'],'ROWS',s['rows'])
        for c in s['cells'][:75]: print(c['cell'],repr(c['text'])[:170],c['formula'] or '')
