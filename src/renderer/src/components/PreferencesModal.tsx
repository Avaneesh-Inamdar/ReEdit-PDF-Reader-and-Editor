import { useUIStore, type AcrobatTheme, type PageUnits } from '../stores/useUIStore'
import { Icon } from './Icon'

export function PreferencesModal(): React.JSX.Element {
  const ui = useUIStore()
  return <div className="modal-overlay" onClick={() => ui.setActiveModal('none')}>
    <div className="modal-card preferences-card" role="dialog" aria-modal="true" aria-labelledby="preferences-heading" onClick={e => e.stopPropagation()}>
      <header className="dialog-header"><h2 id="preferences-heading">Preferences</h2><button className="tb-btn" aria-label="Close preferences" onClick={() => ui.setActiveModal('none')}><Icon name="close" /></button></header>
      <div className="preferences-content">
        <section><h3>Appearance</h3>
          <label>App theme<select aria-label="App theme" value={ui.theme} onChange={e => ui.setTheme(e.target.value as AcrobatTheme)}><option value="system">Follow system</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label>Page display<select aria-label="Page display" value={ui.displayMode} onChange={e => ui.setDisplayMode(e.target.value as 'single' | 'continuous')}><option value="continuous">Continuous scrolling</option><option value="single">Single page</option></select></label>
          <label>Default zoom<select aria-label="Default zoom" value={ui.defaultMagnification} onChange={e => ui.setDefaultMagnification(e.target.value)}>{['Fit Page', 'Fit Width', '50%', '75%', '100%', '125%', '150%', '200%'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Page size units<select aria-label="Page size units" value={ui.pageUnits} onChange={e => ui.setPageUnits(e.target.value as PageUnits)}><option value="points">Points</option><option value="inches">Inches</option><option value="millimeters">Millimeters</option></select></label>
          <label className="checkbox-setting"><input type="checkbox" checked={ui.toolbarVisible} onChange={e => ui.setToolbarVisible(e.target.checked)} />Show document toolbar</label>
        </section>
        <section><h3>Startup</h3>
          <label className="checkbox-setting"><input type="checkbox" checked={ui.maximizeOnOpen} onChange={e => ui.setMaximizeOnOpen(e.target.checked)} />Maximize the window at startup</label>
          <label className="checkbox-setting"><input type="checkbox" checked={ui.displayOpenDialog} onChange={e => ui.setDisplayOpenDialog(e.target.checked)} />Show Open PDF at startup</label>
        </section>
        <section><h3>Full-screen reading</h3>
          <label>Advance pages<select aria-label="Advance pages" value={ui.fullScreenAutoAdvance} onChange={e => ui.setFullScreenAutoAdvance(Number(e.target.value))}><option value="0">Manually</option><option value="3">Every 3 seconds</option><option value="5">Every 5 seconds</option><option value="10">Every 10 seconds</option></select></label>
          <label className="checkbox-setting"><input type="checkbox" checked={ui.fullScreenLoop} onChange={e => ui.setFullScreenLoop(e.target.checked)} />Loop after the last page</label>
          <label>Background<input aria-label="Full-screen background" type="color" value={ui.fullScreenBg} onChange={e => ui.setFullScreenBg(e.target.value)} /></label>
        </section>
        <section><h3>Default PDF application</h3><p>{window.api.platform === 'linux' ? 'After installing the DEB or RPM package, set Re-Edit PDF as your default PDF application.' : 'After installing, choose Re-Edit PDF for .pdf files in Windows Default apps.'}</p><button className="action-button" onClick={() => { void window.api.openDefaultApps().then(() => { if (window.api.platform === 'linux') alert('Re-Edit PDF is now your default PDF application.') }).catch(error => alert('Unable to change the PDF default: ' + String(error))) }}><Icon name="external" /> {window.api.platform === 'linux' ? 'Make default PDF application' : 'Open Windows Default apps'}</button></section>
      </div>
      <footer className="dialog-footer"><span>Preferences are saved automatically.</span><button className="action-button primary" onClick={() => ui.setActiveModal('none')}>Done</button></footer>
    </div>
  </div>
}
