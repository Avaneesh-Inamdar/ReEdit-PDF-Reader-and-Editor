import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { RemovalRegion } from '../shared/pdfOperations'

export interface PdfOpenResult {
  filePath: string
  data: ArrayBuffer
}

export interface PdfApi {
  platform: string
  signCertificate: (bytes: Uint8Array, password: string, name: string, reason: string) => Promise<string | null>
  exportWord: (pages: {text:string;size:number}[][], name: string) => Promise<string | null>
  importOffice: () => Promise<string | null>
  removePdfContent: (bytes: Uint8Array, regions: RemovalRegion[], secure: boolean) => Promise<Uint8Array>
  normalizeImportedFont: (bytes: Uint8Array) => Promise<Uint8Array>
  checkForUpdates: () => Promise<{current: string; latest?: string; available: boolean; message: string}>
  openReleases: () => Promise<void>
  openFile: () => Promise<PdfOpenResult | null>
  saveFile: (bytes: Uint8Array, defaultName?: string, filePath?: string) => Promise<string | null>
  saveFileAs: (bytes: Uint8Array, defaultName?: string) => Promise<string | null>
  getRecentFiles: () => Promise<{ path: string; name: string }[]>
  removeRecentFile: (path: string) => Promise<void>
  readPdf: (filePath: string) => Promise<ArrayBuffer>
  confirmClose: (name: string) => Promise<'save' | 'discard' | 'cancel'>
  onCloseRequested: (cb: () => void) => () => void
  forceClose: () => Promise<void>
  ready: () => Promise<void>
  setDocumentTitle: (title: string) => Promise<void>
  openDefaultApps: () => Promise<void>
  pickPdfs: () => Promise<PdfOpenResult[]>
  saveAttachment: (bytes: Uint8Array, name: string) => Promise<string | null>
  getCurrentPath: () => Promise<string | null>
  onFileOpened: (cb: (data: PdfOpenResult) => void) => () => void
  onFileClosed: (cb: () => void) => () => void
  onMenuAction: (cb: (action: string) => void) => () => void
  // frameless window controls
  minimize: () => Promise<void>
  maximize: () => Promise<boolean>
  close: () => Promise<void>
  print: (pages: { image: string; width: number; height: number }[]) => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChanged: (cb: (isMax: boolean) => void) => () => void
}

const api: PdfApi = {
  platform: process.platform,
  signCertificate: (bytes,password,name,reason) => ipcRenderer.invoke('pdf:signCertificate',bytes,password,name,reason),
  exportWord: (pages,name) => ipcRenderer.invoke('office:exportWord',pages,name),
  importOffice: () => ipcRenderer.invoke('office:import'),
  removePdfContent: (bytes, regions, secure) => ipcRenderer.invoke('pdf:removeContent', bytes, regions, secure),
  normalizeImportedFont: bytes => ipcRenderer.invoke('font:normalize', bytes),
  checkForUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  openReleases: () => ipcRenderer.invoke('app:openReleases'),
  openFile: () => ipcRenderer.invoke('dialog:openPdf'),
  saveFile: (bytes, defaultName, filePath) =>
    ipcRenderer.invoke('dialog:savePdf', bytes, defaultName, filePath),
  saveFileAs: (bytes, defaultName) => ipcRenderer.invoke('dialog:savePdfAs', bytes, defaultName),
  getRecentFiles: () => ipcRenderer.invoke('store:getRecent'),
  removeRecentFile: (path: string) => ipcRenderer.invoke('store:removeRecent', path),
  readPdf: (filePath) => ipcRenderer.invoke('fs:readPdf', filePath),
  confirmClose: (name) => ipcRenderer.invoke('dialog:confirmClose', name),
  onCloseRequested: (cb) => {
    ipcRenderer.on('window:closeRequested', cb)
    return () => {
      ipcRenderer.removeListener('window:closeRequested', cb)
    }
  },
  forceClose: () => ipcRenderer.invoke('window:forceClose'),
  ready: () => ipcRenderer.invoke('renderer:ready'),
  setDocumentTitle: (title) => ipcRenderer.invoke('window:documentTitle', title),
  openDefaultApps: () => ipcRenderer.invoke('system:defaultApps'),
  pickPdfs: () => ipcRenderer.invoke('dialog:pickPdfs'),
  saveAttachment: (bytes, name) => ipcRenderer.invoke('dialog:saveAttachment', bytes, name),
  getCurrentPath: () => ipcRenderer.invoke('store:getCurrentPath'),
  onFileOpened: (cb) => {
    const handler = (_: unknown, data: PdfOpenResult): void => cb(data)
    ipcRenderer.on('file:opened', handler as never)
    return (): void => {
      ipcRenderer.removeListener('file:opened', handler as never)
    }
  },
  onFileClosed: (cb) => {
    const handler = (): void => cb()
    ipcRenderer.on('file:closed', handler as never)
    return (): void => {
      ipcRenderer.removeListener('file:closed', handler as never)
    }
  },
  onMenuAction: (cb) => {
    const handler = (_: unknown, action: string): void => cb(action)
    ipcRenderer.on('menu:action', handler as never)
    return (): void => {
      ipcRenderer.removeListener('menu:action', handler as never)
    }
  },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  print: (pages) => ipcRenderer.invoke('window:print', pages),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChanged: (cb) => {
    const handler = (_: unknown, v: boolean): void => cb(v)
    ipcRenderer.on('window:maximize-changed', handler as never)
    return (): void => {
      ipcRenderer.removeListener('window:maximize-changed', handler as never)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore Electron non-isolated fallback exposes APIs directly on window.
  window.electron = electronAPI
  // @ts-ignore Electron non-isolated fallback exposes APIs directly on window.
  window.api = api
}
