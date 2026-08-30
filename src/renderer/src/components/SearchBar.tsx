import { useEffect, useRef, useState, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { useOcrStore } from '../stores/useOcrStore'

export function SearchBar({ pdfDoc, open, onClose }: { pdfDoc: PDFDocumentProxy | null; open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { searchQuery, searchMatches, currentMatch, setSearch, setCurrentMatch } = usePdfStore()
  const [local, setLocal] = useState(searchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => setLocal(searchQuery), [searchQuery])

  const scrollToMatch = useCallback((idx: number, matches: { page: number; index: number }[]) => {
    const m = matches[idx]
    if (!m) return
    const el = document.getElementById(`page-${m.page}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    usePdfStore.getState().setCurrentPage(m.page)
  }, [])

  const doSearch = useCallback(async (q: string) => {
    const needle = q.trim().toLowerCase()
    if (!pdfDoc || !needle) {
      setSearch('', [])
      return
    }
    setIsSearching(true)
    try {
      const matches: { page: number; index: number }[] = []
      // Search PDF text layer (pdf.js) — combine fragmented items like pdf.js PDFFindController
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p)
        const tc = await page.getTextContent()
        const items = tc.items as unknown as { str: string }[]
        // Build combined string with offsets to catch cross-item matches (e.g. "Hello" split as "Hel" + "lo")
        let combined = ''
        const offsets: number[] = []
        for (const it of items) {
          offsets.push(combined.length)
          combined += (it.str || '') + ' '
        }
        const lower = combined.toLowerCase()
        let pos = lower.indexOf(needle)
        // if needle found anywhere on page, push all items that intersect it
        if (pos !== -1) {
          // naive: mark every item that contains substring, or if combined match spans items, mark first intersecting item
          for (let i = 0; i < items.length; i++) {
            const s = (items[i].str || '').toLowerCase()
            if (s && s.includes(needle)) matches.push({ page: p, index: i })
          }
          // if no single item contains needle but combined does (fragmented), push a synthetic match for page
          if (!matches.some(m => m.page === p)) {
            // find first item index that contains part of needle position
            for (let i = 0; i < items.length; i++) {
              const start = offsets[i]
              const end = start + (items[i].str?.length || 0)
              if (pos >= start - needle.length && pos < end) {
                matches.push({ page: p, index: i })
                break
              }
            }
            if (!matches.some(m => m.page === p)) matches.push({ page: p, index: 0 })
          }
        }
      }
      // Search OCR layer (Tesseract words) — like Stirling-PDF OCR overlay
      const ocrState = useOcrStore.getState().ocrResults
      for (const [pageStr, pageData] of Object.entries(ocrState)) {
        const pageNum = Number(pageStr)
        if (!pageData?.words) continue
        pageData.words.forEach((w: { text: string }, idx: number) => {
          if (w.text.toLowerCase().includes(needle)) {
            // avoid duplicate if already have a match for same page+index (ocr index offset)
            // encode ocr matches with high index offset to avoid collision
            matches.push({ page: pageNum, index: 100000 + idx })
          }
        })
      }
      setSearch(q, matches)
      if (matches.length) {
        setCurrentMatch(0)
        scrollToMatch(0, matches)
      }
    } catch (e) {
      console.warn('search failed', e)
    } finally {
      setIsSearching(false)
    }
  }, [pdfDoc, setSearch, setCurrentMatch, scrollToMatch])

  // Debounced live search like Acrobat / pdf.js viewer
  const onChange = (v: string): void => {
    setLocal(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void doSearch(v) }, 280)
  }

  const navigate = (dir: 1 | -1): void => {
    if (!searchMatches.length) return
    let next = currentMatch + dir
    if (next < 0) next = searchMatches.length - 1
    if (next >= searchMatches.length) next = 0
    setCurrentMatch(next)
    scrollToMatch(next, searchMatches)
  }

  if (!open) return null

  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0"
      style={{
        height: 36,
        background: 'var(--acrobat-toolbar)',
        borderBottom: '1px solid var(--acrobat-toolbar-border)'
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--acrobat-text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input
        ref={inputRef}
        value={local}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (e.shiftKey) navigate(-1)
            else if (searchMatches.length) navigate(1)
            else void doSearch(local)
          }
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Find in document…"
        className="text-xs"
        style={{
          flex: 1,
          maxWidth: 360,
          height: 26,
          borderRadius: 4,
          border: '1px solid var(--acrobat-input-border)',
          background: 'var(--acrobat-input-bg)',
          color: 'var(--acrobat-text)',
          padding: '0 8px',
          outline: 'none'
        }}
      />
      <button
        onClick={() => void doSearch(local)}
        className="rounded text-xs font-medium text-white px-3"
        style={{ height: 26, background: 'var(--acrobat-accent)', opacity: isSearching ? 0.6 : 1 }}
        disabled={isSearching}
      >
        {isSearching ? '…' : 'Find'}
      </button>
      {searchMatches.length > 0 ? (
        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--acrobat-text-muted)' }}>
          {currentMatch + 1} / {searchMatches.length}
          <button className="tb-btn" style={{ width: 22, height: 22 }} onClick={() => navigate(-1)} title="Previous (Shift+Enter)">‹</button>
          <button className="tb-btn" style={{ width: 22, height: 22 }} onClick={() => navigate(1)} title="Next (Enter)">›</button>
        </span>
      ) : local.trim() ? (
        <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>No matches</span>
      ) : null}
      <div className="flex-1" />
      <button className="tb-btn" onClick={() => { setSearch('', []); onClose() }} style={{ fontSize: 12 }}>✕</button>
    </div>
  )
}
