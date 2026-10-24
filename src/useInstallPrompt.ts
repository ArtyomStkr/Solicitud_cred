import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type RelatedNavigator = Navigator & { standalone?: boolean; getInstalledRelatedApps?: () => Promise<{ id?: string; url?: string; platform: string }[]> };
const runningAsApp = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as RelatedNavigator).standalone === true;
const getSaved = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => runningAsApp() || getSaved('josu.installed') === 'yes');
  const [dismissed, setDismissed] = useState(false);
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const modes = matchMedia('(display-mode: standalone)');
    const remember = () => { setInstalled(true); setPrompt(null); try { localStorage.setItem('josu.installed', 'yes'); } catch { /* Optional hint. */ } };
    const before = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); setInstalled(false); setDismissed(false); try { localStorage.removeItem('josu.installed'); } catch { /* The browser event is authoritative. */ } };
    const onMode = () => { if (runningAsApp()) remember(); };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', remember);
    modes.addEventListener('change', onMode);
    const nav = navigator as RelatedNavigator;
    if (nav.getInstalledRelatedApps && !runningAsApp()) nav.getInstalledRelatedApps().then(apps => {
      if (apps.some(app => app.platform === 'webapp' && (app.id?.includes('/Solicitud_cred/') || app.url?.includes('/Solicitud_cred/')))) remember();
    }).catch(() => {});
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', remember); modes.removeEventListener('change', onMode); };
  }, []);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === 'accepted') { setInstalled(true); try { localStorage.setItem('josu.installed', 'yes'); } catch { /* Optional hint. */ } }
    else setDismissed(true);
  }
  return { visible: !installed && !dismissed && (!!prompt || isAppleMobile), canPrompt: !!prompt, install, dismiss: () => setDismissed(true) };
}
