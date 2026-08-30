import { useUIStore, type AcrobatTheme, type PageUnits } from '../stores/useUIStore'
import { useState } from 'react'

const THEMES: { id: AcrobatTheme; label: string; desc: string; preview: string }[] = [
  { id: 'system', label: 'OS Default', desc: 'Matches system', preview: 'linear-gradient(135deg, #f3f4f6 50%, #1e1e1e 50%)' },
  { id: 'classic', label: 'Classic Gray', desc: 'Reader classic', preview: '#525659' },
  { id: 'dark', label: 'Dark Slate', desc: 'Easy on eyes', preview: '#1e1e1e' },
  { id: 'light', label: 'Light', desc: 'Bright workspace', preview: '#f3f4f6' }
]

export function PreferencesModal(): React.JSX.Element {
  const {
    setActiveModal, theme, setTheme, displayMode, setDisplayMode,
    defaultMagnification, setDefaultMagnification, maxFitVisibleMag, setMaxFitVisibleMag,
    displayLargeImages, setDisplayLargeImages, usePageCache, setUsePageCache,
    greekTextPixels, setGreekTextPixels, substitutionFonts, setSubstitutionFonts,
    pageUnits, setPageUnits, displaySplash, setDisplaySplash, displayOpenDialog, setDisplayOpenDialog,
    maximizeOnOpen, setMaximizeOnOpen, fullScreenLoop, setFullScreenLoop, fullScreenBg, setFullScreenBg,
    fullScreenAutoAdvance, setFullScreenAutoAdvance, toolbarVisible, setToolbarVisible
  } = useUIStore()
  const [tab, setTab] = useState<'general'|'fullscreen'>('general')

  return (
    <div className="modal-overlay" onClick={() => setActiveModal('none')}>
      <div className="modal-card flex flex-col" style={{ width: 640, maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 44, borderBottom: '1px solid var(--acrobat-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--acrobat-text)' }}>Preferences – Adobe Acrobat Reader Guide</span>
          <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}>✕</button>
        </div>

        {/* Tabs per Adobe guide: General | Full Screen */}
        <div className="flex gap-1 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--acrobat-border)', background: 'var(--acrobat-chrome-alt)' }}>
          <button className={`tb-btn ${tab==='general'?'active':''}`} style={{ fontSize: 12 }} onClick={()=> setTab('general')}>General</button>
          <button className={`tb-btn ${tab==='fullscreen'?'active':''}`} style={{ fontSize: 12 }} onClick={()=> setTab('fullscreen')}>Full Screen</button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6" style={{ color: 'var(--acrobat-text)' }}>
          {/* Theme + Display – kept for app */}
          <div className="p-3 rounded" style={{ border:'1px solid var(--acrobat-border)', background:'var(--acrobat-chrome-alt)' }}>
            <div className="pane-title">Appearance</div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {THEMES.map(t=> (
                <button key={t.id} onClick={()=> setTheme(t.id)} className="rounded p-2 text-center" style={{ border: theme===t.id?'2px solid var(--acrobat-accent)':'1px solid var(--acrobat-border)', background: theme===t.id?'rgba(20,115,230,0.08)':'transparent' }}>
                  <div style={{ width:'100%', height:22, borderRadius:4, background:t.preview, border:'1px solid var(--acrobat-border)' }} />
                  <div className="text-xs font-medium mt-1">{t.label}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={()=> setDisplayMode('continuous')} className="flex-1 rounded p-2 text-xs" style={{ border: displayMode==='continuous'?'2px solid var(--acrobat-accent)':'1px solid var(--acrobat-border)' }}>Continuous</button>
              <button onClick={()=> setDisplayMode('single')} className="flex-1 rounded p-2 text-xs" style={{ border: displayMode==='single'?'2px solid var(--acrobat-accent)':'1px solid var(--acrobat-border)' }}>Single Page</button>
            </div>
            <label className="flex items-center gap-2 mt-3 text-xs"><input type="checkbox" checked={toolbarVisible} onChange={e=> setToolbarVisible(e.target.checked)} /> Show Tool Bar (Window → Hide Tool Bar)</label>
          </div>

          {tab==='general' ? (
            <>
              <div>
                <div className="pane-title">General Preferences (Adobe Guide p9)</div>
                <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                  <label className="flex flex-col gap-1">Default Magnification
                    <select value={defaultMagnification} onChange={e=> setDefaultMagnification(e.target.value)} className="h-7 rounded border px-2" style={{ background:'var(--acrobat-input-bg)', borderColor:'var(--acrobat-input-border)', color:'var(--acrobat-text)' }}>
                      <option>Fit Page</option><option>Fit Width</option><option>Fit Visible</option><option>100%</option><option>50%</option><option>75%</option><option>125%</option><option>150%</option><option>200%</option><option>Actual Size</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Max “Fit Visible” Magnification (%)
                    <input type="number" min={10} max={400} value={maxFitVisibleMag} onChange={e=> setMaxFitVisibleMag(parseInt(e.target.value)||200)} className="h-7 rounded border px-2" style={{ background:'var(--acrobat-input-bg)', borderColor:'var(--acrobat-input-border)', color:'var(--acrobat-text)' }} />
                  </label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={displayLargeImages} onChange={e=> setDisplayLargeImages(e.target.checked)} /> Display Large Images (no gray boxes)</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={usePageCache} onChange={e=> setUsePageCache(e.target.checked)} /> Use Page Cache (faster paging)</label>
                  <label className="flex flex-col gap-1">Greek Text below [ ] pixels
                    <input type="number" min={1} max={20} value={greekTextPixels} onChange={e=> setGreekTextPixels(parseInt(e.target.value)||4)} className="h-7 rounded border px-2" style={{ background:'var(--acrobat-input-bg)', borderColor:'var(--acrobat-input-border)', color:'var(--acrobat-text)' }} />
                  </label>
                  <label className="flex flex-col gap-1">Substitution Fonts
                    <select value={substitutionFonts} onChange={e=> setSubstitutionFonts(e.target.value)} className="h-7 rounded border px-2" style={{ background:'var(--acrobat-input-bg)', borderColor:'var(--acrobat-input-border)', color:'var(--acrobat-text)' }}>
                      <option>Multiple Master</option><option>Adobe Sans MM</option><option>Adobe Serif MM</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">Page Units
                    <select value={pageUnits} onChange={e=> setPageUnits(e.target.value as PageUnits)} className="h-7 rounded border px-2" style={{ background:'var(--acrobat-input-bg)', borderColor:'var(--acrobat-input-border)', color:'var(--acrobat-text)' }}>
                      <option value="points">Points</option><option value="inches">Inches</option><option value="millimeters">Millimeters</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={displaySplash} onChange={e=> setDisplaySplash(e.target.checked)} /> Display Splash Screen at Startup</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={displayOpenDialog} onChange={e=> setDisplayOpenDialog(e.target.checked)} /> Display Open Dialog at Startup</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={maximizeOnOpen} onChange={e=> setMaximizeOnOpen(e.target.checked)} /> Maximize Application on Opening (Windows only)</label>
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="pane-title">Full Screen Preferences (Adobe Guide p10)</div>
              <div className="space-y-3 mt-2 text-xs">
                <label className="flex flex-col gap-1">Change pages
                  <select value={String(fullScreenAutoAdvance)} onChange={e=> setFullScreenAutoAdvance(parseInt(e.target.value))} className="h-7 rounded border px-2" style={{ background:'var(--acrobat-input-bg)', borderColor:'var(--acrobat-input-border)', color:'var(--acrobat-text)' }}>
                    <option value="0">Manual – mouse / keyboard</option>
                    <option value="3">Automatic every 3 seconds</option>
                    <option value="5">Automatic every 5 seconds</option>
                    <option value="10">Automatic every 10 seconds</option>
                  </select>
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={fullScreenLoop} onChange={e=> setFullScreenLoop(e.target.checked)} /> Loop – continuously from first to last page</label>
                <label className="flex items-center gap-2">Background color
                  <input type="color" value={fullScreenBg} onChange={e=> setFullScreenBg(e.target.value)} className="w-10 h-7 p-0 border rounded" />
                  <span style={{ color:'var(--acrobat-text-dim)' }}>{fullScreenBg}</span>
                </label>
                <div className="rounded p-2 text-xs" style={{ background:'var(--acrobat-chrome-alt)', border:'1px solid var(--acrobat-border)' }}>
                  Full-screen reading hides toolbars. Press <code>Esc</code> to exit. Use <code>Ctrl+L</code> or View → Full Screen. Articles and links remain active.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-4 py-3 shrink-0" style={{ borderTop:'1px solid var(--acrobat-border)' }}>
          <span className="text-xs" style={{ color:'var(--acrobat-text-dim)' }}>README / How to use this online guide: click underlined links, Go Back, Next Page, First Page, bookmarks triangle, arrow for continued topics.</span>
          <button onClick={()=> setActiveModal('none')} className="rounded text-xs font-medium text-white px-6" style={{ height:30, background:'var(--acrobat-accent)' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
