import { create } from 'zustand'

export type AcrobatTheme = 'system' | 'classic' | 'dark' | 'light'
export type LeftPane = 'thumbnails' | 'bookmarks' | 'attachments' | 'closed'
export type RightPane = 'none' | 'comment' | 'sign' | 'edit' | 'organize' | 'ocr' | 'forms' | 'redact' | 'protect'
export type PointerMode = 'select' | 'hand' | 'selectGraphics'
export type DisplayMode = 'continuous' | 'single'
export type ActiveView = 'home' | 'tools' | 'document'
export type ActiveModal = 'none' | 'docProperties' | 'preferences' | 'organizePages' | 'signature' | 'about' | 'shortcuts'
export type PageUnits = 'inches' | 'millimeters' | 'points'

export interface BookmarkItem {
  title: string
  pageNumber: number
  children: BookmarkItem[]
  expanded: boolean
}

export interface AttachmentItem {
  name: string
  size: number
  data: Uint8Array | null
}

export interface SavedSignature {
  id: string
  type: 'typed' | 'drawn' | 'image'
  dataUrl: string // base64 data URL for rendering
  label: string
}

interface UIState {
  // View
  activeView: ActiveView
  setActiveView: (v: ActiveView) => void

  // Theme
  theme: AcrobatTheme
  setTheme: (t: AcrobatTheme) => void

  // Left pane
  leftPane: LeftPane
  leftPaneWidth: number
  setLeftPane: (p: LeftPane) => void
  toggleLeftPane: () => void
  setLeftPaneWidth: (w: number) => void

  // Right pane
  rightPane: RightPane
  setRightPane: (p: RightPane) => void
  toggleRightPane: () => void

  // Pointer & display
  pointerMode: PointerMode
  setPointerMode: (m: PointerMode) => void
  displayMode: DisplayMode
  setDisplayMode: (m: DisplayMode) => void

  // Modals
  activeModal: ActiveModal
  setActiveModal: (m: ActiveModal) => void

  // Bookmarks from PDF outline
  bookmarks: BookmarkItem[]
  setBookmarks: (b: BookmarkItem[]) => void
  toggleBookmark: (path: number[]) => void

  // Attachments
  attachments: AttachmentItem[]
  setAttachments: (a: AttachmentItem[]) => void

  // Saved signatures
  signatures: SavedSignature[]
  addSignature: (s: SavedSignature) => void
  removeSignature: (id: string) => void

  // Spacebar hand mode (temporary)
  spaceHeld: boolean
  setSpaceHeld: (v: boolean) => void

  // Full screen reading mode
  isFullScreen: boolean
  setFullScreen: (v: boolean) => void

  // Context properties bar (appears under toolbar for active annotation tool)
  showContextBar: boolean
  setShowContextBar: (v: boolean) => void

  // Thumbnail size in nav pane
  thumbnailScale: number
  setThumbnailScale: (s: number) => void

  // Menu bar open menu
  openMenu: string | null
  setOpenMenu: (m: string | null) => void

  // Highlight form fields toggle
  highlightFormFields: boolean
  setHighlightFormFields: (v: boolean) => void

  // Preferences per Adobe Guide p9-10
  defaultMagnification: string
  setDefaultMagnification: (v: string) => void
  maxFitVisibleMag: number
  setMaxFitVisibleMag: (v: number) => void
  displayLargeImages: boolean
  setDisplayLargeImages: (v: boolean) => void
  usePageCache: boolean
  setUsePageCache: (v: boolean) => void
  greekTextPixels: number
  setGreekTextPixels: (v: number) => void
  substitutionFonts: string
  setSubstitutionFonts: (v: string) => void
  pageUnits: PageUnits
  setPageUnits: (v: PageUnits) => void
  displaySplash: boolean
  setDisplaySplash: (v: boolean) => void
  displayOpenDialog: boolean
  setDisplayOpenDialog: (v: boolean) => void
  maximizeOnOpen: boolean
  setMaximizeOnOpen: (v: boolean) => void
  // Full-screen prefs
  fullScreenLoop: boolean
  setFullScreenLoop: (v: boolean) => void
  fullScreenBg: string
  setFullScreenBg: (v: string) => void
  fullScreenAutoAdvance: number // seconds 0 = manual
  setFullScreenAutoAdvance: (v: number) => void
  // Toolbar visibility
  toolbarVisible: boolean
  setToolbarVisible: (v: boolean) => void
  // Navigation history (Go Back/Forward per guide)
  navHistory: { page:number; zoom:number }[]
  navIndex: number
  pushNavHistory: (page:number, zoom:number) => void
  goBack: () => { page:number; zoom:number } | null
  goForward: () => { page:number; zoom:number } | null
}

function toggleBookmarkRecursive(items: BookmarkItem[], path: number[]): BookmarkItem[] {
  if (path.length === 0) return items
  return items.map((item, i) => {
    if (i === path[0]) {
      if (path.length === 1) return { ...item, expanded: !item.expanded }
      return { ...item, children: toggleBookmarkRecursive(item.children, path.slice(1)) }
    }
    return item
  })
}

export const useUIStore = create<UIState>((set, get) => ({
  activeView: 'home',
  setActiveView: (activeView) => set({ activeView }),

  theme: 'system',
  setTheme: (theme) => set({ theme }),

  leftPane: 'thumbnails',
  leftPaneWidth: 200,
  setLeftPane: (leftPane) => set({ leftPane }),
  toggleLeftPane: () => {
    const cur = get().leftPane
    set({ leftPane: cur === 'closed' ? 'thumbnails' : 'closed' })
  },
  setLeftPaneWidth: (leftPaneWidth) => set({ leftPaneWidth }),

  rightPane: 'none',
  setRightPane: (rightPane) => {
    const cur = get().rightPane
    set({ rightPane: cur === rightPane ? 'none' : rightPane })
  },
  toggleRightPane: () => {
    set({ rightPane: get().rightPane === 'none' ? 'comment' : 'none' })
  },

  pointerMode: 'select',
  setPointerMode: (pointerMode) => set({ pointerMode }),

  displayMode: 'continuous',
  setDisplayMode: (displayMode) => set({ displayMode }),

  activeModal: 'none',
  setActiveModal: (activeModal) => set({ activeModal }),

  bookmarks: [],
  setBookmarks: (bookmarks) => set({ bookmarks }),
  toggleBookmark: (path) => set({ bookmarks: toggleBookmarkRecursive(get().bookmarks, path) }),

  attachments: [],
  setAttachments: (attachments) => set({ attachments }),

  signatures: [],
  addSignature: (s) => set({ signatures: [...get().signatures, s] }),
  removeSignature: (id) => set({ signatures: get().signatures.filter((s) => s.id !== id) }),

  spaceHeld: false,
  setSpaceHeld: (spaceHeld) => set({ spaceHeld }),

  isFullScreen: false,
  setFullScreen: (isFullScreen) => set({ isFullScreen }),

  showContextBar: false,
  setShowContextBar: (showContextBar) => set({ showContextBar }),

  thumbnailScale: 0.22,
  setThumbnailScale: (thumbnailScale) => set({ thumbnailScale }),

  openMenu: null,
  setOpenMenu: (openMenu) => set({ openMenu }),

  highlightFormFields: false,
  setHighlightFormFields: (highlightFormFields) => set({ highlightFormFields }),

  defaultMagnification: 'Fit Page',
  setDefaultMagnification: (defaultMagnification) => set({ defaultMagnification }),
  maxFitVisibleMag: 200,
  setMaxFitVisibleMag: (maxFitVisibleMag) => set({ maxFitVisibleMag }),
  displayLargeImages: true,
  setDisplayLargeImages: (displayLargeImages) => set({ displayLargeImages }),
  usePageCache: true,
  setUsePageCache: (usePageCache) => set({ usePageCache }),
  greekTextPixels: 4,
  setGreekTextPixels: (greekTextPixels) => set({ greekTextPixels }),
  substitutionFonts: 'Multiple Master',
  setSubstitutionFonts: (substitutionFonts) => set({ substitutionFonts }),
  pageUnits: 'points' as PageUnits,
  setPageUnits: (pageUnits) => set({ pageUnits }),
  displaySplash: true,
  setDisplaySplash: (displaySplash) => set({ displaySplash }),
  displayOpenDialog: false,
  setDisplayOpenDialog: (displayOpenDialog) => set({ displayOpenDialog }),
  maximizeOnOpen: false,
  setMaximizeOnOpen: (maximizeOnOpen) => set({ maximizeOnOpen }),
  fullScreenLoop: false,
  setFullScreenLoop: (fullScreenLoop) => set({ fullScreenLoop }),
  fullScreenBg: '#000000',
  setFullScreenBg: (fullScreenBg) => set({ fullScreenBg }),
  fullScreenAutoAdvance: 0,
  setFullScreenAutoAdvance: (fullScreenAutoAdvance) => set({ fullScreenAutoAdvance }),
  toolbarVisible: true,
  setToolbarVisible: (toolbarVisible) => set({ toolbarVisible }),
  navHistory: [],
  navIndex: -1,
  pushNavHistory: (page, zoom) => {
    const { navHistory, navIndex } = get()
    const last = navHistory[navIndex]
    if (last && last.page === page && Math.abs(last.zoom - zoom) < 0.01) return
    const sliced = navHistory.slice(0, navIndex + 1)
    sliced.push({ page, zoom })
    if (sliced.length > 50) sliced.shift()
    set({ navHistory: sliced, navIndex: sliced.length - 1 })
  },
  goBack: () => {
    const { navHistory, navIndex } = get()
    if (navIndex <= 0) return null
    const nextIdx = navIndex - 1
    set({ navIndex: nextIdx })
    return navHistory[nextIdx]
  },
  goForward: () => {
    const { navHistory, navIndex } = get()
    if (navIndex >= navHistory.length -1) return null
    const nextIdx = navIndex + 1
    set({ navIndex: nextIdx })
    return navHistory[nextIdx]
  }
}))
