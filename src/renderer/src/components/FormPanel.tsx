import { usePdfStore } from '../stores/usePdfStore'
import { useFormStore } from '../stores/useFormStore'
import { saveDocument } from '../lib/documentActions'

export function FormPanel(): React.JSX.Element {
  const { data } = usePdfStore()
  const { fields, hasXfa, hasAcroForm, isEncrypted, updateField } = useFormStore()
  const onFillAndSave = async (flatten: boolean): Promise<void> => { await saveDocument(true, flatten) }

  if (!data) return <p className="text-xs text-zinc-500">Open a PDF to inspect forms.</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {hasAcroForm ? <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-900/40 border border-emerald-800 text-emerald-300">AcroForm: {fields.length} fields</span> : <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">AcroForm: none</span>}
        {hasXfa ? <span className="text-[11px] px-2 py-1 rounded-full bg-amber-900/40 border border-amber-800 text-amber-300">XFA: detected — unsupported</span> : <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">XFA: none</span>}
        {isEncrypted ? <span className="text-[11px] px-2 py-1 rounded-full bg-red-900/40 border border-red-800 text-red-300">Encrypted</span> : <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">Not encrypted</span>}
      </div>
      {hasXfa && <div className="rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-200">XFA forms cannot be filled in this version.</div>}
      {fields.length === 0 ? <p className="text-xs text-zinc-500">No fillable AcroForm fields detected.</p> : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f.name} className="block space-y-1">
              <span className="text-xs text-zinc-400">{f.name} <span className="text-[10px] text-zinc-500">({f.type})</span></span>
              {f.type === 'PDFCheckBox' ? (
                <input type="checkbox" checked={f.value === 'true'} disabled={f.readOnly} onChange={e => updateField(f.name, String(e.target.checked))} />
              ) : f.options ? (
                <select multiple={f.multiple} value={f.multiple ? f.value.split('\n') : f.value} disabled={f.readOnly} onChange={e => updateField(f.name, f.multiple ? Array.from(e.target.selectedOptions, option => option.value).join('\n') : e.target.value)} className="pref-select w-full">
                  <option value="">Choose an option</option>
                  {f.options.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : <input value={f.value} disabled={f.readOnly} required={f.required} onChange={e => updateField(f.name, e.target.value)} className="pref-select w-full" placeholder={f.readOnly ? 'Read only' : 'Enter value'} />}

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
