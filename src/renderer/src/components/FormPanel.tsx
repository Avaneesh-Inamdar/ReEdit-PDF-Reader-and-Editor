import { useEffect } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { useFormStore } from '../stores/useFormStore'
import { inspectForms, fillFormAndSave } from '../lib/forms'

export function FormPanel(): React.JSX.Element {
  const { data, filePath, setData } = usePdfStore()
  const { fields, hasXfa, hasAcroForm, isEncrypted, setFields, setFlags, updateField } = useFormStore()

  useEffect(() => {
    if (!data) { setFields([]); setFlags({ hasXfa: false, hasAcroForm: false, isEncrypted: false }); return }
    let cancelled = false
    inspectForms(data.slice(0)).then((res) => { if (!cancelled) { setFields(res.fields); setFlags({ hasXfa: res.hasXfa, hasAcroForm: res.hasAcroForm, isEncrypted: res.isEncrypted }) } }).catch(() => {})
    return () => { cancelled = true }
  }, [data, setFields, setFlags])

  const onFillAndSave = async (flatten: boolean): Promise<void> => {
    if (!data) return
    const values: Record<string,string> = {}
    fields.forEach(f=> values[f.name]= f.value)
    try {
      const bytes = await fillFormAndSave(data.slice(0), values, flatten)
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      setData(buf)
      // offer save dialog
      const saved = await window.api.saveFileAs(new Uint8Array(bytes), (filePath?.split(/[\\/]/).pop()?.replace('.pdf','') || 'form') + (flatten ? '-filled-flat.pdf' : '-filled.pdf'))
      if (saved) alert(`Saved to ${saved}`)
    } catch (e) { alert('Fill failed: ' + String(e)) }
  }

  if (!data) return <p className="text-xs text-zinc-500">Open a PDF to inspect forms.</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {hasAcroForm ? <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-900/40 border border-emerald-800 text-emerald-300">AcroForm: {fields.length} fields</span> : <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">AcroForm: none</span>}
        {hasXfa ? <span className="text-[11px] px-2 py-1 rounded-full bg-amber-900/40 border border-amber-800 text-amber-300">XFA: detected — unsupported</span> : <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">XFA: none</span>}
        {isEncrypted ? <span className="text-[11px] px-2 py-1 rounded-full bg-red-900/40 border border-red-800 text-red-300">Encrypted</span> : <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">Not encrypted</span>}
      </div>
      {hasXfa && <div className="rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-200">XFA forms are not supported for filling — shown as unsupported badge per spec. Use Adobe Acrobat for XFA.</div>}
      {fields.length === 0 ? <p className="text-xs text-zinc-500">No fillable AcroForm fields detected.</p> : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f.name} className="block space-y-1">
              <span className="text-xs text-zinc-400">{f.name} <span className="text-[10px] text-zinc-500">({f.type})</span></span>
              <input value={f.value} onChange={(e)=> updateField(f.name, e.target.value)} className="w-full h-7 rounded bg-zinc-950 border border-zinc-800 px-2 text-xs text-zinc-100 focus:border-zinc-600 focus:outline-none" placeholder={f.type} />
            </label>
          ))}
        </div>
      )}
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={()=> onFillAndSave(false)} className="h-7 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs">Save Editable</button>
          <button onClick={()=> onFillAndSave(true)} className="h-7 rounded bg-red-600 hover:bg-red-500 text-white text-xs">Export Flattened</button>
        </div>
      )}
    </div>
  )
}
