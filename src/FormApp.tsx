import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, LoaderCircle, Menu, Moon, RotateCcw, Smartphone, Sun, X } from 'lucide-react';
import { allFields, emptyForm, fieldError, sections, type Field, type FormData } from './schema';
import { download, generateODS, readTemplate, type Template } from './ods';
import { drawLogo } from './logo';
import { useInstallPrompt } from './useInstallPrompt';

const DRAFT = 'josu.form.v1';
function initialData(): FormData {
  const values = emptyForm();
  try { const stored = JSON.parse(localStorage.getItem(DRAFT) || 'null'); for (const f of allFields) if (typeof stored?.[f.cell] === 'string') values[f.cell] = stored[f.cell]; } catch { /* Start empty if storage is unavailable. */ }
  return values;
}
function initialTheme() { try { return localStorage.getItem('josu.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } }

export default function App() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState<FormData>(initialData);
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState('');
  const [clear, setClear] = useState(false);
  const [format, setFormat] = useState<'ods' | 'xlsx'>('ods');
  const installation = useInstallPrompt();
  const logo = useRef<HTMLCanvasElement>(null);
  const section = sections[active];
  const required = allFields.filter(f => f.required);
  const complete = required.filter(f => !fieldError(f, form[f.cell] || '')).length;
  const issues = allFields.filter(f => fieldError(f, form[f.cell] || ''));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('josu.theme', theme); } catch { /* Optional preference. */ }
    const context = logo.current?.getContext('2d'); if (context) drawLogo(context, theme === 'dark');
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', `${import.meta.env.BASE_URL}${theme === 'dark' ? 'icon-192-night.png' : 'icon-192.png'}`);
    const setBrowserColor = () => {
      const installed = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', installed ? '#101713' : theme === 'dark' ? '#17211b' : '#f5f7f2');
    };
    setBrowserColor();
    const mode = matchMedia('(display-mode: standalone)');
    mode.addEventListener('change', setBrowserColor);
    document.documentElement.style.colorScheme = theme;
    return () => mode.removeEventListener('change', setBrowserColor);
  }, [theme]);
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify(form)); } catch { /* Export still works with storage disabled. */ } }, 350); return () => clearTimeout(t); }, [form]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);
  async function load() {
    try { setError(''); const response = await fetch(`${import.meta.env.BASE_URL}plantilla.ods`); if (!response.ok) throw new Error('No se pudo cargar la plantilla. Reintenta en unos segundos.'); setTemplate(readTemplate(new Uint8Array(await response.arrayBuffer()))); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!clear) return;
    document.getElementById('cancel-clear')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClear(false);
      if (e.key === 'Tab') { const ids = ['cancel-clear', 'confirm-clear']; const i = ids.indexOf((document.activeElement as HTMLElement).id); e.preventDefault(); document.getElementById(ids[i === 0 ? 1 : 0])?.focus(); }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, [clear]);
  function go(index: number) { setActive(index); setMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function generate() {
    if (!template || busy) return;
    setAttempted(true);
    if (issues.length) { go(sections.findIndex(s => s.fields.some(f => f.cell === issues[0].cell))); setTimeout(() => document.getElementById(issues[0].cell)?.focus(), 50); return; }
    setBusy(true); setError(''); await new Promise(resolve => setTimeout(resolve, 30));
    try {
      const output = generateODS(template, form);
      const name = form.J2.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
      if (format === 'xlsx') {
        const { generateXLSX } = await import('./xlsx');
        const response = await fetch(`${import.meta.env.BASE_URL}plantilla.xlsx`);
        if (!response.ok) throw new Error('No se pudo cargar la plantilla de Excel. Inténtalo otra vez.');
        const bytes = generateXLSX(new Uint8Array(await response.arrayBuffer()), readTemplate(output.bytes));
        download(bytes, `${name || 'Solicitud'}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else download(output.bytes, `${name || 'Solicitud'}.ods`);
      setToast('Tu expediente se descargó correctamente.');
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function field(f: Field) {
    const value = form[f.cell] || ''; const problem = attempted ? fieldError(f, value) : '';
    const props = { id: f.cell, name: f.cell, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f.cell]: e.target.value })), 'aria-invalid': !!problem, 'aria-describedby': problem ? `${f.cell}-error` : undefined };
    return <div key={f.cell} className={`field ${f.wide ? 'wide' : ''} ${problem ? 'invalid' : ''}`}>
      <label htmlFor={f.cell}>{f.label}{f.required && <span className="required">*</span>}</label>
      {f.options ? <div className="select-wrap"><select {...props}><option value="">Seleccionar</option>{f.options.map(o => <option key={o}>{o}</option>)}</select><ChevronDown size={16} /></div> : f.type === 'textarea' ? <textarea {...props} rows={3} placeholder={f.placeholder || 'Escribe aquí'} /> : <input {...props} type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.min} max={f.max} placeholder={f.placeholder || (f.type === 'date' ? undefined : 'Escribe aquí')} autoComplete="off" />}
      {problem && <small className="field-error" id={`${f.cell}-error`}>{problem}</small>}
    </div>;
  }
  return <div className="app">
    <header className="header"><div className="header-inner"><a className="brand" href="#" aria-label="JOSU, ir al inicio" onClick={e => { e.preventDefault(); go(0); }}><canvas width={256} height={256} ref={logo} role="img" aria-label="JOSU" /><span>Solicitudes<span className="brand-divider" />Crédito</span></a><div className="header-actions"><button className="quiet-button clear-button" onClick={() => setClear(true)}><RotateCcw size={15} /><span>Limpiar</span></button><button className="icon-button theme-toggle" aria-label={theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button></div></div></header>
    <main>
      {installation.visible && <div className="install-banner" role="region" aria-label="Instalar JOSU"><img src={`${import.meta.env.BASE_URL}icon-app-192.png`} alt="" /><div><strong>Instala JOSU</strong><p>{installation.canPrompt ? 'Accede desde tu pantalla de inicio.' : 'En Safari, toca Compartir y luego Añadir a pantalla de inicio.'}</p></div>{installation.canPrompt && <button className="primary" onClick={() => installation.install().catch(() => setToast('Usa el menú de tu navegador para instalar JOSU.'))}><Smartphone size={16} />Instalar</button>}<button className="icon-button" aria-label="Cerrar aviso de instalación" onClick={installation.dismiss}><X size={16} /></button></div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span>{!template && <button onClick={load}>Reintentar</button>}<button className="icon-button" aria-label="Cerrar error" onClick={() => setError('')}><X size={16} /></button></div>}
      <div className="mobile-section"><button className="secondary" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu size={17} /><span>{active + 1}. {section.title}</span><ChevronDown size={15} /></button><span>{active + 1} / {sections.length}</span></div>
      <div className="layout">
        <aside className={`section-nav ${menu ? 'open' : ''}`}><div className="nav-label">INFORMACIÓN GENERAL</div><nav aria-label="Secciones del formulario">{sections.map((s, i) => <button key={s.id} className={`nav-item ${active === i ? 'active' : ''}`} aria-current={active === i ? 'step' : undefined} onClick={() => go(i)}><span className="nav-number">{String(i + 1).padStart(2, '0')}</span><span>{s.title.replace('Datos del ', '').replace('Relaciones y vinculaciones', 'Vinculaciones')}</span>{s.fields.every(f => !f.required || !fieldError(f, form[f.cell] || '')) && s.fields.some(f => form[f.cell]) && <Check size={13} />}</button>)}</nav></aside>
        <section className="form-card" aria-labelledby="section-heading"><div className="section-heading"><div><div className="step-label">PASO {String(active + 1).padStart(2, '0')} <span>/ {String(sections.length).padStart(2, '0')}</span></div><h2 id="section-heading">{section.title}</h2></div><span className="section-dots" aria-hidden="true">{sections.map((s, i) => <i key={s.id} className={i === active ? 'current' : ''} />)}</span></div><p className="section-description">{section.subtitle}</p><div className="card-divider" /><div className="required-note"><span>*</span> Campos necesarios</div><form className="fields" onSubmit={e => { e.preventDefault(); active < sections.length - 1 ? go(active + 1) : generate(); }}>{section.fields.map(field)}</form><div className="form-footer"><button className="quiet-button" onClick={() => go(active - 1)} disabled={active === 0}><ArrowLeft size={16} />Anterior</button><button className="primary" onClick={() => active < sections.length - 1 ? go(active + 1) : generate()} disabled={busy || (active === sections.length - 1 && !template)}>{active < sections.length - 1 ? <>Siguiente<ArrowRight size={16} /></> : <><ArrowDownToLine size={16} />Descargar .{format}</>}</button></div></section>
        <aside className="summary"><img className="summary-logo" src={`${import.meta.env.BASE_URL}josu-${theme === 'dark' ? 'noche' : 'dia'}.png`} alt="" /><h3>Tu solicitud</h3><div className="summary-data"><span>SOLICITANTE</span><strong>{form.J2 || 'Nombre del solicitante'}</strong><span>MONTO SOLICITADO</span><b>{form.J27 ? `Bs ${Number(form.J27).toLocaleString('es-BO', { maximumFractionDigits: 2 })}` : 'Bs —'}</b><div className="summary-row"><div><span>PLAZO</span><strong>{form.J32 || '—'}</strong></div><div><span>N° DE CRÉDITO</span><strong>{form.J80 || '—'}</strong></div></div></div><div className="summary-bottom"><div className="completion"><span>Datos necesarios</span><strong>{complete}/{required.length}</strong></div><div className="progress-track"><span style={{ width: `${complete / required.length * 100}%` }} /></div><div className="export-format" role="group" aria-label="Formato de descarga"><button aria-pressed={format === 'ods'} onClick={() => setFormat('ods')}>ODS</button><button aria-pressed={format === 'xlsx'} onClick={() => setFormat('xlsx')}>Excel .xlsx</button></div><button className="primary" onClick={generate} disabled={!template || busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowDownToLine size={17} />}{busy ? 'Generando…' : `Descargar .${format}`}</button></div></aside>
      </div>
      <div className="bottom-line"><CheckCircle2 size={13} /><span>El borrador se guarda en este navegador.</span></div>
    </main>
    <div className="system-nav-safe-area" aria-hidden="true" />
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button aria-label="Cerrar aviso" onClick={() => setToast('')}><X size={15} /></button></div>}
    {clear && <div className="modal-backdrop" onClick={() => setClear(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="clear-title" onClick={e => e.stopPropagation()}><h2 id="clear-title">¿Vaciar el formulario?</h2><p>Se borrarán los datos que ingresaste para empezar una nueva solicitud.</p><div className="modal-actions"><button className="secondary" id="cancel-clear" onClick={() => setClear(false)}>Cancelar</button><button className="primary" id="confirm-clear" onClick={() => { setForm(emptyForm()); setAttempted(false); setClear(false); go(0); }}>Vaciar formulario</button></div></section></div>}
  </div>;
}
