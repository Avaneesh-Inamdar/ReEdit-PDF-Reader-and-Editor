import { Icon } from './Icon'
import { requestText } from '../lib/requestText'
import { useState, useRef, useEffect } from 'react'
import { useAnnotationStore, type Annotation } from '../stores/useAnnotationStore'
import { useEditStore } from '../stores/useEditStore'
import { useUIStore } from '../stores/useUIStore'
import { usePdfStore } from '../stores/usePdfStore'
import { placedTextHeight } from '../lib/placedTextHeight'

function uid(): string { return Math.random().toString(36).slice(2, 9) }

export function AnnotationLayer({
  pageNumber,
  width,
  height
}: {
  pageNumber: number
  width: number
  height: number
}): React.JSX.Element {
  const { tool, color, strokeWidth, annotations, addAnnotation, deleteAnnotation, selectedId, setSelected, updateAnnotation } = useAnnotationStore()
  const editStore = useEditStore()
  const { spaceHeld, pointerMode } = useUIStore()
  const zoom = usePdfStore(state => state.zoom)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragOrigin = useRef({ x: 0, y: 0 })
  const manipulation = useRef<{ annotation: Annotation; latest?: Annotation; origin: { x: number; y: number }; resize: boolean } | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([])
  const [ctxMenu, setCtxMenu] = useState<{ x:number; y:number; id:string } | null>(null)

  const pageAnnos = annotations.filter((a) => a.page === pageNumber && !a.sourceText)

  useEffect(() => {
    const onDocClick = (): void => setCtxMenu(null)
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const getNorm = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  const onPointerDown = async (e: React.PointerEvent): Promise<void> => {
    if (ctxMenu) setCtxMenu(null)
    if (tool === 'select' && !spaceHeld && pointerMode !== 'hand') {
      const target = (e.target as SVGElement).closest('[data-anno-id]') as SVGElement | null
      const annotation = pageAnnos.find(a => a.id === target?.dataset.annoId)
      if (annotation) {
        if (annotation.type === 'text' && pointerMode === 'select' && (e.target as Element).closest('foreignObject')) {
          setSelected(annotation.id)
          return
        }
        e.preventDefault()
        setSelected(annotation.id)
        manipulation.current = { annotation: { ...annotation, h: placedTextHeight(annotation, width, height, zoom) / height }, origin: getNorm(e), resize: (e.target as SVGElement).getAttribute('data-resize') === 'true' }
      }
      return
    }
    if (tool === 'select' || tool === 'eraser' || spaceHeld || pointerMode === 'hand') return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = getNorm(e)
    dragOrigin.current = p
    setDrawing(true)
    if (tool === 'draw' || tool === 'arrow') {
      setDrawPoints([p])
    } else if (tool === 'note') {
      const note: Annotation = { id: uid(), page: pageNumber, type: 'note', x: p.x, y: p.y, w: 0.22, h: 0.12, color: '#fef08a', strokeWidth: 1, opacity: 1, text: 'Note…' }
      addAnnotation(note)
      setSelected(note.id)
    } else if (tool === 'text') {
      const pending = editStore.pendingText
      const text = pending?.text || await requestText('Enter text to place:', '')
      if (!text) { setDrawing(false); return }
      const sz = pending || { text, color: '#111827', size: 12 }
      const col = (sz as { color?: string }).color || '#111827'
      const t: Annotation = { id: uid(), page: pageNumber, type: 'text', x: p.x, y: p.y, w: 0.32, h: 0.05, color: col, strokeWidth: 1, opacity: 1, text, fontSize: (pending as { size?: number })?.size || 12, fontFamily: 'Helvetica' }
      addAnnotation(t)
      setSelected(t.id)
      useAnnotationStore.getState().setTool('select')
      useUIStore.getState().setPointerMode('selectGraphics')
      setDrawing(false)
    } else if (tool === 'image') {
      const pi = editStore.pendingImage
      if (!pi) {
        window.dispatchEvent(new CustomEvent('pdf:requestImage', { detail: { page: pageNumber, x: p.x, y: p.y } }))
        setDrawing(false)
        return
      }
      const w = pi.widthNorm || 0.3
      const h = pi.aspectRatio ? w * width / (height * pi.aspectRatio) : 0.22
      const imgAnno: Annotation = { id: uid(), page: pageNumber, type: 'image', x: Math.min(p.x, 1 - w), y: Math.min(p.y, 1 - h), w, h, color: '#000', strokeWidth: 1, opacity: 1, image: pi }
      addAnnotation(imgAnno)
      setSelected(imgAnno.id)
      editStore.setPendingImage(null)
      useAnnotationStore.getState().setTool('select')
      setDrawing(false)
    } else {
      let col = color
      let op = 1
      let type: Annotation['type'] = 'rect'
      if (tool === 'highlight') { col = '#facc15'; op = 0.4; type = 'highlight' }
      else if (tool === 'underline') { col = '#22c55e'; type = 'underline' }
      else if (tool === 'strike') { col = '#ef4444'; type = 'strike' }
      else if (tool === 'rect') type = 'rect'
      else if (tool === 'ellipse') type = 'ellipse'
      else if (tool === 'redact') { col = '#000000'; op = 1; type = 'redact' }
      setDraft({ id: uid(), page: pageNumber, type, x: p.x, y: p.y, w: 0, h: 0, color: col, strokeWidth, opacity: op })
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (manipulation.current) {
      const { annotation, origin, resize } = manipulation.current
      const point = getNorm(e)
      const dx = point.x - origin.x, dy = point.y - origin.y
      if (Math.abs(dx * width) + Math.abs(dy * height) < 3) return
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      let next: Annotation
      if (resize) {
        const w = Math.max(0.02, Math.min(1 - annotation.x, annotation.w + dx))
        const h = annotation.type === 'image' ? Math.min(1 - annotation.y, annotation.h * w / annotation.w) : Math.max(0.02, Math.min(1 - annotation.y, annotation.h + dy))
        next = { ...annotation, w, h }
      } else next = { ...annotation, x: Math.max(0, Math.min(1 - annotation.w, annotation.x + dx)), y: Math.max(0, Math.min(1 - annotation.h, annotation.y + dy)) }
      manipulation.current.latest = next
      setDraft(next)
      return
    }
    if (!drawing) return
    const p = getNorm(e)
    if (tool === 'draw' || tool === 'arrow') {
      setDrawPoints((prev) => [...prev, p])
    } else if (draft) {
      const x = Math.min(dragOrigin.current.x, p.x)
      const y = Math.min(dragOrigin.current.y, p.y)
      const w = Math.abs(p.x - dragOrigin.current.x)
      const h = Math.abs(p.y - dragOrigin.current.y)
      if (tool === 'underline' || tool === 'strike') setDraft({ ...draft, x, y: y + h / 2, w, h: 0.004 })
      else setDraft({ ...draft, x, y, w, h })
    }
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    if (manipulation.current) {
      const latest = manipulation.current.latest
      if (latest) updateAnnotation(latest.id, { x: latest.x, y: latest.y, w: latest.w, h: latest.h })
      manipulation.current = null
      setDraft(null)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      return
    }
    if (!drawing) return
    setDrawing(false)
    if (tool === 'draw' || tool === 'arrow') {
      if (drawPoints.length < 2) { setDrawPoints([]); return }
      const xs = drawPoints.map((p) => p.x), ys = drawPoints.map((p) => p.y)
      const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys)
      const w = Math.max(0.01, maxX - minX), h = Math.max(0.01, maxY - minY)
      const normPts = drawPoints.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }))
      const anno: Annotation = { id: uid(), page: pageNumber, type: tool === 'arrow' ? 'arrow' : 'draw', x: minX, y: minY, w, h, color, strokeWidth, opacity: 1, points: normPts }
      addAnnotation(anno)
      setDrawPoints([])
    } else if (draft) {
      if (draft.w < 0.01 && draft.h < 0.01) { setDraft(null); return }
      addAnnotation(draft)
      setDraft(null)
    }
    try { (e.target as Element).releasePointerCapture(e.pointerId) } catch {}
  }

  const onSvgClick = (e: React.MouseEvent): void => {
    if (tool !== 'eraser') return
    const target = (e.target as SVGElement).closest('[data-anno-id]') as SVGElement | null
    if (target?.dataset.annoId) deleteAnnotation(target.dataset.annoId)
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    const target = (e.target as SVGElement).closest('[data-anno-id]') as SVGElement | null
    if (!target?.dataset.annoId) return
    e.preventDefault()
    setSelected(target.dataset.annoId)
    setCtxMenu({ x: e.clientX, y: e.clientY, id: target.dataset.annoId })
  }

  const renderAnno = (a: Annotation): React.JSX.Element => {
    const px = a.x * width, py = a.y * height, pw = a.w * width, ph = placedTextHeight(a, width, height, zoom)
    const isSelected = selectedId === a.id
    const outline = isSelected ? '2px solid #38bdf8' : undefined
    const pe: React.CSSProperties = { pointerEvents: 'auto' as const }
    if (a.type === 'highlight') return <rect key={a.id} data-anno-id={a.id} x={px} y={py} width={pw} height={ph} fill={a.color} opacity={a.opacity} rx={2} style={{ outline, cursor: tool === 'eraser' ? 'crosshair' : 'pointer', ...pe }} onClick={() => setSelected(a.id)} />
    if (a.type === 'underline') return <rect key={a.id} data-anno-id={a.id} x={px} y={py} width={pw} height={Math.max(2, a.strokeWidth)} fill={a.color} style={{ outline, ...pe }} onClick={() => setSelected(a.id)} />
    if (a.type === 'strike') return <rect key={a.id} data-anno-id={a.id} x={px} y={py - ph / 2} width={pw} height={Math.max(2, a.strokeWidth)} fill={a.color} style={{ outline, ...pe }} onClick={() => setSelected(a.id)} />
    if (a.type === 'rect') return <rect key={a.id} data-anno-id={a.id} x={px} y={py} width={pw} height={ph} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} rx={2} style={{ outline, ...pe }} onClick={() => setSelected(a.id)} />
    if (a.type === 'ellipse') return <ellipse key={a.id} data-anno-id={a.id} cx={px + pw / 2} cy={py + ph / 2} rx={pw / 2} ry={ph / 2} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} style={{ outline, ...pe }} onClick={() => setSelected(a.id)} />
    if (a.type === 'redact') return <rect key={a.id} data-anno-id={a.id} x={px} y={py} width={pw} height={ph} fill={a.color} opacity={0.95} stroke="#000" style={{ outline, ...pe }} onClick={() => setSelected(a.id)} />
    if (a.type === 'draw' && a.points) {
      const pts = a.points.map((p) => `${a.x * width + p.x * pw},${a.y * height + p.y * ph}`).join(' ')
      return <polyline key={a.id} data-anno-id={a.id} points={pts} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ outline, ...pe }} onClick={() => setSelected(a.id)} />
    }
    if (a.type === 'arrow' && a.points && a.points.length >= 2) {
      const pts = a.points.map((p) => `${a.x * width + p.x * pw},${a.y * height + p.y * ph}`).join(' ')
      return <g key={a.id} data-anno-id={a.id} style={{ outline: outline as never, ...pe }} onClick={() => setSelected(a.id)}><polyline points={pts} fill="none" stroke={a.color} strokeWidth={a.strokeWidth} markerEnd="url(#arrowhead)" /><defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={a.color} /></marker></defs></g>
    }
    if (a.type === 'text') {
      const fam = (a.fontFamily || 'Helvetica').toLowerCase()
      const family = a.previewFont || (fam.includes('times') ? 'Times New Roman, serif' : fam.includes('courier') ? 'Courier New, monospace' : fam.includes('helvetica') ? 'Arial, sans-serif' : a.fontFamily || 'Arial')
      return (
        <g key={a.id} data-anno-id={a.id} onClick={() => setSelected(a.id)} onDoubleClick={async (e) => { e.stopPropagation(); setSelected(a.id); const value = await requestText('Edit placed text', a.text || ''); if (value !== null) updateAnnotation(a.id, { text: value }) }} style={{ cursor: 'text', outline: outline as never, pointerEvents: 'auto' }}>
          <rect x={px} y={py} width={pw} height={ph} fill="transparent" stroke={isSelected ? '#38bdf8' : 'transparent'} strokeWidth={isSelected ? 1.5 : 1} style={{ pointerEvents: 'all' }} />
          <foreignObject x={px+4} y={py+2} width={pw-8} height={ph-4} style={{ pointerEvents: 'auto' }}>
            <div style={{ fontSize: (a.fontSize || 12) * zoom, color: a.color, fontFamily: family, fontWeight: a.bold || /bold/i.test(a.fontFamily || '') ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', lineHeight: 1.2, overflow: 'visible', whiteSpace: 'pre-wrap', wordBreak: 'break-word', width: '100%', height: '100%', pointerEvents: 'auto', userSelect: 'text' }}>{a.text}</div>
          </foreignObject>
          {isSelected && (
            <g>
              <circle cx={px} cy={py} r={4} fill="#38bdf8" stroke="#fff" strokeWidth={1} />
              <circle data-resize="true" cx={px+pw} cy={py+ph} r={5} fill="#38bdf8" stroke="#fff" strokeWidth={1} style={{ cursor: 'nwse-resize' }} />
            </g>
          )}
        </g>
      )
    }
    if (a.type === 'image') return (
      <g key={a.id} data-anno-id={a.id} onClick={() => setSelected(a.id)} style={{ outline: outline as never, pointerEvents: 'auto' }}>
        <image href={a.image?.dataUrl} x={px} y={py} width={pw} height={ph} preserveAspectRatio="none" />
        {isSelected && <rect x={px} y={py} width={pw} height={ph} fill="none" stroke="#38bdf8" strokeWidth={1.5} />}
        {isSelected && <circle data-resize="true" cx={px+pw} cy={py+ph} r={5} fill="#38bdf8" stroke="white" strokeWidth={1} style={{ cursor: 'nwse-resize' }} />}
      </g>
    )
    if (a.type === 'note') return (
      <g key={a.id} data-anno-id={a.id} onClick={() => setSelected(a.id)} style={{ cursor: 'pointer', outline: outline as never, pointerEvents: 'auto' }}>
        <rect x={px} y={py} width={pw} height={ph} fill="#fef08a" stroke="#eab308" strokeWidth={1} rx={6} style={{ pointerEvents: 'auto' }} />
        <foreignObject x={px + 6} y={py + 6} width={pw - 12} height={ph - 12} style={{ pointerEvents: 'auto' }}><div className="text-[11px] leading-tight text-zinc-900 font-medium break-words overflow-hidden h-full" style={{ pointerEvents: 'auto' }}>{a.text}<button onClick={async (e) => { e.stopPropagation(); const v = await requestText('Edit note', a.text || ''); if(v!==null) updateAnnotation(a.id, { text: v }) }} className="ml-1 text-[10px] underline text-zinc-600" style={{ pointerEvents: 'auto' }}>edit</button></div></foreignObject>
      </g>
    )
    return <g key={a.id} />
  }

  const draftEl = draft ? renderAnno(draft) : null
  const drawPreview = (tool === 'draw' || tool === 'arrow') && drawPoints.length > 1 ? (
    <polyline points={drawPoints.map((p) => `${p.x * width},${p.y * height}`).join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.9} />
  ) : null

  const isSelectMode = tool === 'select' || pointerMode === 'select' || pointerMode === 'selectGraphics'
  const svgPointerEvents = isSelectMode && !spaceHeld ? 'none' as const : 'auto' as const
  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : tool === 'eraser' ? 'crosshair' : 'crosshair', pointerEvents: svgPointerEvents }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { manipulation.current = null; setDraft(null); setDrawing(false) }}
        onClick={onSvgClick}
        onContextMenu={onContextMenu}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" style={{ pointerEvents: tool === 'select' || spaceHeld || pointerMode === 'hand' ? 'none' : 'auto' }} />
        {pageAnnos.filter(a => a.id !== draft?.id).map(a => <g key={a.id} data-annotation-object={a.id} data-annotation-type={a.type} data-selected={selectedId === a.id}>
          {pointerMode === 'selectGraphics' && tool === 'select' && <rect data-anno-id={a.id} x={a.x * width} y={a.y * height} width={Math.max(6, a.w * width)} height={Math.max(6, placedTextHeight(a, width, height, zoom))} fill="transparent" style={{ pointerEvents: 'all' }} />}
          {renderAnno(a)}
          {selectedId === a.id && !['text', 'image'].includes(a.type) && <rect x={a.x * width} y={a.y * height} width={a.w * width} height={Math.max(4, a.h * height)} fill="none" stroke="#1473e6" strokeWidth={1} strokeDasharray="3 2" style={{ pointerEvents: 'none' }} />}
        </g>)}
        {draftEl}
        {drawPreview}
      </svg>
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e)=> e.stopPropagation()}>
          <div className="ctx-item" onClick={async ()=> { const a = annotations.find(x=> x.id===ctxMenu.id); if (a?.type==='text') { const v=await requestText('Edit text', a.text||''); if(v!==null) updateAnnotation(ctxMenu.id, { text: v }) } else { const v=await requestText('Edit note', annotations.find(x=> x.id===ctxMenu.id)?.text||''); if(v!==null) updateAnnotation(ctxMenu.id, { text: v || '' }) } setCtxMenu(null) }}><Icon name="edit" /> Edit…</div>
          <div className="ctx-item" onClick={()=> { const a = annotations.find(x=> x.id===ctxMenu.id); if(a) { const dup={...a, id: uid(), x: Math.min(0.85, a.x+0.02), y: Math.min(0.85, a.y+0.02)}; addAnnotation(dup as never); setSelected(dup.id) } setCtxMenu(null) }}><Icon name="copy" /> Duplicate</div>
          <div className="ctx-item" style={{ color:'#ef5350' }} onClick={()=> { deleteAnnotation(ctxMenu.id); setCtxMenu(null) }}><Icon name="delete" /> Remove</div>
        </div>
      )}
    </>
  )
}
