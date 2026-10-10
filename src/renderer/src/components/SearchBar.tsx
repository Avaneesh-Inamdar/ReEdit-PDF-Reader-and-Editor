import { pageText } from '../lib/rendering'
import { Icon } from './Icon'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { findTextMatches, type SearchMatch } from '../lib/pdfSearch'

export function SearchBar({ pdfDoc, open, onClose }: { pdfDoc: PDFDocumentProxy | null; open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { searchQuery, searchMatches, currentMatch, setSearch, setCurrentMatch } = usePdfStore()
  const [local, setLocal] = useState(searchQuery)
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWords, setWholeWords] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchVersion = useRef(0)
  useEffect(() => () => { searchVersion.current++; if (debounceRef.current) clearTimeout(debounceRef.current) }, [pdfDoc, open])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!open) {
      searchVersion.current++
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setSearch('', [])
      setLocal('')
      setIsSearching(false)
    }
  }, [open, setSearch])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    searchVersion.current++
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearch('', [])
    setLocal('')
    setIsSearching(false)
  }, [pdfDoc, setSearch])

  const scrollToMatch = useCallback((idx: number, matches: { page: number; index: number }[]) => {
    const m = matches[idx]
    if (!m) return
    const el = document.getElementById(`page-${m.page}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    usePdfStore.getState().setCurrentPage(m.page)
  }, [])

  const doSearch = useCallback(async (q: string, caseSensitive = matchCase, whole = wholeWords) => {
    const version = ++searchVersion.current
    const needle = q.trim().toLowerCase()
    if (!pdfDoc || !needle) {
      setSearch('', [])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const matches: SearchMatch[] = []
      for (let page = 1; page <= pdfDoc.numPages; page++) {
        if (version !== searchVersion.current) return
        const content = await pageText(pdfDoc, page)
        matches.push(...findTextMatches(content.items, q, page, caseSensitive, whole))
      }
      if (version !== searchVersion.current) return
      setSearch(q, matches)
      if (matches.length) {
        setCurrentMatch(0)
        scrollToMatch(0, matches)
      }
    } catch (e) {
      console.warn('search failed', e)
    } finally {
      if (version === searchVersion.current) setIsSearching(false)
    }
  }, [pdfDoc, setSearch, setCurrentMatch, scrollToMatch, matchCase, wholeWords])

  // Debounced live search like Acrobat / pdf.js viewer
  const onChange = (v: string): void => {
    searchVersion.current++
    setLocal(v)
    setSearch('', [])
    setIsSearching(!!v.trim())
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

  useEffect(() => {
    if (!open) return
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key === 'F3' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g')) {
        event.preventDefault()
        navigate(event.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [open, searchMatches, currentMatch])

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
      <Icon name="search" size={14} />
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
          if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) { e.preventDefault(); e.stopPropagation(); onClose() }
        }}
        aria-label="Find in document"
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
      ) : local.trim() && !isSearching ? (
        <span className="text-xs" style={{ color: 'var(--acrobat-text-dim)' }}>No matches</span>
      ) : null}
      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
        <input type="checkbox" checked={matchCase} onChange={event => {
          setMatchCase(event.target.checked)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          void doSearch(local, event.target.checked, wholeWords)
        }} />Match case
      </label>
      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
        <input type="checkbox" checked={wholeWords} onChange={event => {
          setWholeWords(event.target.checked)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          void doSearch(local, matchCase, event.target.checked)
        }} />Whole words
      </label>
      <div className="flex-1" />
      <button className="tb-btn" onClick={() => { setSearch('', []); onClose() }} style={{ fontSize: 12 }}><Icon name="close" /></button>
    </div>
  )
}
