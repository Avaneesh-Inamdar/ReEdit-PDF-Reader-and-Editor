import { ElectronAPI } from '@electron-toolkit/preload'
import type { PdfApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PdfApi
  }
}
