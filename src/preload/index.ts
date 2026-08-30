import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface PdfOpenResult {
  filePath: string
  data: ArrayBuffer
}

export interface PdfApi {
  openFile: () => Promise<PdfOpenResult | null>
  saveFile: (bytes: Uint8Array, defaultName?: string) => Promise<string | null>
  saveFileAs: (bytes: Uint8Array, defaultName?: string) => Promise<string | null>
  getRecentFiles: () => Promise<{ path: string; name: string }[]>
  readPdf: (filePath: string) => Promise<ArrayBuffer>
  getCurrentPath: () => Promise<string | null>
  onFileOpened: (cb: (data: PdfOpenResult) => void) => () => void
  onFileClosed: (cb: () => void) => () => void
  onMenuAction: (cb: (action: string) => void) => () => void
  // frameless window controls
  minimize: () => Promise<void>
  maximize: () => Promise<boolean>
  close: () => Promise<void>
  print: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChanged: (cb: (isMax: boolean) => void) => () => void
}

const api: PdfApi = {
  openFile: () => ipcRenderer.invoke('dialog:openPdf'),
  saveFile: (bytes, defaultName) => ipcRenderer.invoke('dialog:savePdf', bytes, defaultName),
  saveFileAs: (bytes, defaultName) => ipcRenderer.invoke('dialog:savePdfAs', bytes, defaultName),
  getRecentFiles: () => ipcRenderer.invoke('store:getRecent'),
  readPdf: (filePath) => ipcRenderer.invoke('fs:readPdf', filePath),
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
  print: () => ipcRenderer.invoke('window:print'),
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
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
