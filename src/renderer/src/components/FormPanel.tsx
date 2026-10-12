import { usePdfStore } from '../stores/usePdfStore'
import { useFormStore } from '../stores/useFormStore'
import { saveDocument } from '../lib/documentActions'

export function FormPanel(): React.JSX.Element {
  const { data } = usePdfStore()
  const { fields, hasXfa, hasAcroForm, isEncrypted, updateField } = useFormStore()
  const onFillAndSave = async (flatten: boolean): Promise<void> => {
    await saveDocument(true, flatten)
  }

  if (!data) return <p className="text-xs text-zinc-500">Open a PDF to inspect forms.</p>

  return (
    <div className="form-workflow space-y-3">
      <div className="workspace-metadata">
        <span>AcroForm</span>
        <span>
          {hasAcroForm ? `${fields.length} field${fields.length === 1 ? '' : 's'}` : 'None'}
        </span>
        <span>XFA</span>
        <span>{hasXfa ? 'Detected · unsupported' : 'None'}</span>
        <span>Encryption</span>
        <span>{isEncrypted ? 'Encrypted' : 'None'}</span>
      </div>
      {hasXfa && <div className="workspace-note">XFA forms cannot be filled in this version.</div>}
      {fields.length === 0 ? (
        <p className="text-xs text-zinc-500">No fillable AcroForm fields detected.</p>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f.name} className="block space-y-1">
              <span className="text-xs">
                {f.name} <span className="workspace-muted text-[10px]">({f.type})</span>
              </span>
              {f.type === 'PDFCheckBox' ? (
                <input
                  type="checkbox"
                  checked={f.value === 'true'}
                  disabled={f.readOnly}
                  onChange={(e) => updateField(f.name, String(e.target.checked))}
                />
              ) : f.options ? (
                <select
                  multiple={f.multiple}
                  value={f.multiple ? f.value.split('\n') : f.value}
                  disabled={f.readOnly}
                  onChange={(e) =>
                    updateField(
                      f.name,
                      f.multiple
                        ? Array.from(e.target.selectedOptions, (option) => option.value).join('\n')
                        : e.target.value
                    )
                  }
                  className="pref-select w-full"
                >
                  <option value="">Choose an option</option>
                  {f.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={f.value}
                  disabled={f.readOnly}
                  required={f.required}
                  onChange={(e) => updateField(f.name, e.target.value)}
                  className="pref-select w-full"
                  placeholder={f.readOnly ? 'Read only' : 'Enter value'}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {fields.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onFillAndSave(false)}
            className="action-button primary justify-center"
          >
            Save editable copy
          </button>
          <button onClick={() => onFillAndSave(true)} className="action-button justify-center">
            Export flattened copy
          </button>
        </div>
      )}
    </div>
  )
}
