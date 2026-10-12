import { pageText } from '../lib/rendering'
import { Icon } from './Icon'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../stores/usePdfStore'
import { findTextMatches, type SearchMatch } from '../lib/pdfSearch'
import { useAnnotationStore } from '../stores/useAnnotationStore'

export function SearchBar({
  pdfDoc,
  open,
  onClose
}: {
  pdfDoc: PDFDocumentProxy | null
  open: boolean
  onClose: () => void
}): React.JSX.Element | null {
  const { searchQuery, searchMatches, currentMatch, setSearch, setCurrentMatch } = usePdfStore()
  const [local, setLocal] = useState(searchQuery)
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWords, setWholeWords] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchVersion = useRef(0)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const annotations = useAnnotationStore((state) => state.annotations)
  const previousAnnotations = useRef(annotations)
  const [searchedPages, setSearchedPages] = useState(0)
  useEffect(
    () => () => {
      searchVersion.current++
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (revealTimer.current) clearTimeout(revealTimer.current)
    },
    [pdfDoc, open]
  )
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
    const timer = open ? setTimeout(() => inputRef.current?.focus(), 0) : undefined
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    searchVersion.current++
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearch('', [])
    setLocal('')
    setIsSearching(false)
  }, [pdfDoc, setSearch])

  const scrollToMatch = useCallback((idx: number, matches: SearchMatch[]) => {
    const m = matches[idx]
    if (!m) return
    const el = document.getElementById(`page-${m.page}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    usePdfStore.getState().setCurrentPage(m.page)
    let attempts = 0
    const reveal = (): void => {
      const state = usePdfStore.getState()
      if (!state.searchQuery || state.currentMatch !== idx || state.searchMatches[idx] !== m) return
      const hit = m.annotationId
        ? document.querySelector(`[data-edited-text="${m.annotationId}"]`) ||
          document.querySelector(`[data-annotation-object="${m.annotationId}"]`)
        : document.querySelector(`.search-highlight[data-match="${idx}"]`)
      if (hit) {
        hit.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        return
      }
      if (attempts++ < 30) revealTimer.current = setTimeout(reveal, 40)
    }
    if (revealTimer.current) clearTimeout(revealTimer.current)
    revealTimer.current = setTimeout(reveal, 60)
  }, [])

  const doSearch = useCallback(
    async (q: string, caseSensitive = matchCase, whole = wholeWords) => {
      const version = ++searchVersion.current
      const needle = q.trim().toLowerCase()
      if (!pdfDoc || !needle) {
        setSearch('', [])
        setIsSearching(false)
        return
      }
      setIsSearching(true)
      setSearchedPages(0)
      try {
        const matches: SearchMatch[] = []
        for (let page = 1; page <= pdfDoc.numPages; page++) {
          if (version !== searchVersion.current) return
          const content = await pageText(pdfDoc, page)
          const edited = annotations.filter((annotation) => annotation.page === page)
          const items = content.items.map((item, index) => {
            if (!('str' in item)) return item
            let str = item.str
            for (const annotation of edited)
              for (const mask of annotation.maskTexts ||
                (annotation.sourceText ? [annotation.sourceText] : [])) {
                const key = mask.key.match(/^(\d+):(\d+)(?::(\d+)-(\d+))?$/)
                if (!key || Number(key[2]) !== index) continue
                if (key[3] === undefined) {
                  str = ''
                  break
                }
                str =
                  str.slice(0, Number(key[3])) +
                  ' '.repeat(Number(key[4]) - Number(key[3])) +
                  str.slice(Number(key[4]))
              }
            return { ...item, str }
          })
          matches.push(...findTextMatches(items, q, page, caseSensitive, whole))
          for (const annotation of edited.filter((item) => item.type === 'text' && item.text))
            matches.push(
              ...findTextMatches([{ str: annotation.text }], q, page, caseSensitive, whole).map(
                (match) => ({
                  ...match,
                  index: -1,
                  segments: undefined,
                  annotationId: annotation.id
                })
              )
            )
          setSearchedPages(page)
          if (page % 8 === 0 || page === pdfDoc.numPages) {
            setSearch(q, matches.slice())
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
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
    },
    [pdfDoc, setSearch, setCurrentMatch, scrollToMatch, matchCase, wholeWords, annotations]
  )

  useEffect(() => {
    if (previousAnnotations.current === annotations) return
    previousAnnotations.current = annotations
    if (open && local.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void doSearch(local)
    }
  }, [annotations, doSearch, local, open])

  // Debounced live search like Acrobat / pdf.js viewer
  const onChange = (v: string): void => {
    searchVersion.current++
    setLocal(v)
    setSearch('', [])
    setIsSearching(!!v.trim())
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void doSearch(v)
    }, 280)
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
      if (
        event.key === 'F3' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g')
      ) {
        event.preventDefault()
        navigate(event.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [open, searchMatches, currentMatch])

  if (!open) return null

  return (
    <section className="document-find-panel" aria-label="Find panel">
      <header>
        <h2>Find in document</h2>
        <button
          className="tb-btn"
          title="Close Find"
          onClick={() => {
            setSearch('', [])
            onClose()
          }}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="find-query">
        <input
          ref={inputRef}
          value={local}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Find in document"
          placeholder="Enter a word or phrase"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (searchMatches.length) navigate(e.shiftKey ? -1 : 1)
              else void doSearch(local)
            }
            if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
        />
        <button
          className="operation-primary"
          onClick={() => void doSearch(local)}
          disabled={isSearching}
        >
          {isSearching ? 'Searching…' : 'Find'}
        </button>
      </div>
      <div className="find-filter-row">
        <label>
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(e) => {
              setMatchCase(e.target.checked)
              if (debounceRef.current) clearTimeout(debounceRef.current)
              void doSearch(local, e.target.checked, wholeWords)
            }}
          />
          Match case
        </label>
        <label>
          <input
            type="checkbox"
            checked={wholeWords}
            onChange={(e) => {
              setWholeWords(e.target.checked)
              if (debounceRef.current) clearTimeout(debounceRef.current)
              void doSearch(local, matchCase, e.target.checked)
            }}
          />
          Whole words
        </label>
      </div>
      <div className="find-navigation">
        <output aria-live="polite">
          {searchMatches.length
            ? currentMatch + 1 + ' / ' + searchMatches.length
            : local.trim() && !isSearching
              ? 'No matches'
              : 'Enter text to search'}
          {isSearching ? ' · ' + searchedPages + ' / ' + (pdfDoc?.numPages || 0) + ' pages' : ''}
        </output>
        <button
          className="tb-btn"
          disabled={!searchMatches.length}
          onClick={() => navigate(-1)}
          title="Previous (Shift+Enter)"
        >
          <Icon name="previous" size={17} />
        </button>
        <button
          className="tb-btn"
          disabled={!searchMatches.length}
          onClick={() => navigate(1)}
          title="Next (Enter)"
        >
          <Icon name="next" size={17} />
        </button>
      </div>
      {searchMatches.length > 0 && (
        <div className="find-results">
          {searchMatches.slice(0, 60).map((match, index) => (
            <button
              key={index}
              className={currentMatch === index ? 'active' : ''}
              onClick={() => {
                setCurrentMatch(index)
                scrollToMatch(index, searchMatches)
              }}
              title={'Go to match ' + (index + 1)}
            >
              <span>Page {match.page}</span>
              <p>{match.preview || local}</p>
            </button>
          ))}
          {searchMatches.length > 60 && (
            <p className="operation-caption">
              Showing the first 60 results. Use the arrows or F3 to reach every match.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
