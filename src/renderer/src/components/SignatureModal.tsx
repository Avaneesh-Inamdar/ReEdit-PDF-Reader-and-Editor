import { Icon } from './Icon'
import { placeImage } from '../lib/imagePlacement'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'

/* ── Signature Modal ── */
// Type (cursive fonts), Draw (canvas), Image (upload)

type SigMode = 'type' | 'draw' | 'image'

const CURSIVE_FONTS = [
  { name: 'Segoe Script', css: "'Segoe Script', cursive" },
  { name: 'Segoe Print', css: "'Segoe Print', cursive" },
  { name: 'Brush Script', css: "'Brush Script MT', 'Segoe Script', cursive" }
]

export function SignatureModal(): React.JSX.Element {
  const { setActiveModal, addSignature } = useUIStore()
  const [mode, setMode] = useState<SigMode>('type')
  const [text, setText] = useState('')
  const [selectedFont, setSelectedFont] = useState(0)
  const [saveChecked, setSaveChecked] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [imageData, setImageData] = useState<string | null>(null)

  // Draw canvas setup
  useEffect(() => {
    if (mode !== 'draw' || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [mode])

  const startDraw = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return
    isDrawing.current = true
    const rect = canvasRef.current.getBoundingClientRect()
    const ctx = canvasRef.current.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo((e.clientX - rect.left) * canvasRef.current.width / rect.width, (e.clientY - rect.top) * canvasRef.current.height / rect.height)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [])

  const moveDraw = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const ctx = canvasRef.current.getContext('2d')!
    ctx.lineTo((e.clientX - rect.left) * canvasRef.current.width / rect.width, (e.clientY - rect.top) * canvasRef.current.height / rect.height)
    ctx.stroke()
  }, [])

  const endDraw = useCallback(() => {
    isDrawing.current = false
  }, [])

  const clearCanvas = (): void => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageData(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async (): Promise<void> => {
    let dataUrl = ''
    let label = ''

    if (mode === 'type' && text) {
      // Render typed signature to canvas
      const offscreen = document.createElement('canvas')
      offscreen.width = 300
      offscreen.height = 80
      const ctx = offscreen.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 300, 80)
      ctx.fillStyle = '#1a1a1a'
      ctx.font = `36px ${CURSIVE_FONTS[selectedFont].css}`
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 10, 40, 280)
      dataUrl = offscreen.toDataURL('image/png')
      label = text
    } else if (mode === 'draw' && canvasRef.current) {
      dataUrl = canvasRef.current.toDataURL('image/png')
      label = 'Drawn signature'
    } else if (mode === 'image' && imageData) {
      dataUrl = imageData
      label = 'Image signature'
    }

    if (!dataUrl) return

    await placeImage(dataUrl)
    if (saveChecked) {
      addSignature({
        id: Math.random().toString(36).slice(2, 9),
        type: mode === 'type' ? 'typed' : mode === 'draw' ? 'drawn' : 'image',
        dataUrl,
        label
      })
    }

    setActiveModal('none')
  }

  return (
    <div className="modal-overlay" onClick={() => setActiveModal('none')}>
      <div className="modal-card" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4" style={{ height: 44, borderBottom: '1px solid var(--acrobat-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--acrobat-text)' }}>Add Signature</span>
          <button className="tb-btn" onClick={() => setActiveModal('none')} style={{ fontSize: 14 }}><Icon name="close" /></button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--acrobat-border)' }}>
          {(['type', 'draw', 'image'] as SigMode[]).map((m) => (
            <button
              key={m}
              className="px-4 py-2 text-xs font-medium capitalize"
              style={{
                borderBottom: mode === m ? '2px solid var(--tool-sign)' : '2px solid transparent',
                color: mode === m ? 'var(--acrobat-text)' : 'var(--acrobat-text-muted)',
                background: 'transparent'
              }}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4" style={{ minHeight: 160 }}>
          {mode === 'type' && (
            <div className="space-y-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your name…"
                autoFocus
                className="text-sm"
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 6,
                  border: '1px solid var(--acrobat-border)',
                  padding: '0 12px',
                  background: 'var(--acrobat-input-bg)',
                  color: 'var(--acrobat-text)',
                  outline: 'none'
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                {CURSIVE_FONTS.map((f, i) => (
                  <button
                    key={f.name}
                    className="rounded p-3 text-left"
                    style={{
                      border: selectedFont === i ? '2px solid var(--tool-sign)' : '1px solid var(--acrobat-border)',
                      background: '#fff',
                      fontFamily: f.css,
                      fontSize: 22,
                      color: '#1a1a1a',
                      minHeight: 50
                    }}
                    onClick={() => setSelectedFont(i)}
                  >
                    {text || 'Your Name'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'draw' && (
            <div className="space-y-2">
              <canvas
                ref={canvasRef}
                width={410}
                height={120}
                className="sig-canvas w-full"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
              />
              <button className="tb-btn text-xs" onClick={clearCanvas} style={{ border: '1px solid var(--acrobat-border)' }}>
                Clear
              </button>
            </div>
          )}

          {mode === 'image' && (
            <div className="space-y-3">
              {imageData ? (
                <div className="text-center">
                  <img src={imageData} alt="signature" style={{ maxHeight: 100, margin: '0 auto' }} />
                  <button className="tb-btn text-xs mt-2" onClick={() => setImageData(null)}>Remove</button>
                </div>
              ) : (
                <label className="drop-zone cursor-pointer block" style={{ padding: 24 }}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <p className="text-xs font-medium" style={{ color: 'var(--acrobat-text-muted)' }}>Click to upload signature image</p>
                  <p className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>PNG or JPG with transparent background recommended</p>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--acrobat-border)' }}>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--acrobat-text-muted)' }}>
            <input type="checkbox" checked={saveChecked} onChange={(e) => setSaveChecked(e.target.checked)} />
            Save signature
          </label>
          <div className="flex gap-2">
            <button onClick={() => setActiveModal('none')} className="rounded text-xs px-3" style={{ height: 30, border: '1px solid var(--acrobat-border)', background: 'transparent', color: 'var(--acrobat-text)' }}>
              Cancel
            </button>
            <button onClick={handleSave} className="rounded text-xs font-medium text-white px-4" style={{ height: 30, background: 'var(--tool-sign)' }}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
