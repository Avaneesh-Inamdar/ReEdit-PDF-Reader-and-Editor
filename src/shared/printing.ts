export interface PrintOptions {
  deviceName: string
  copies: number
  collate?: boolean
  color: boolean
  duplex: 'simplex' | 'longEdge' | 'shortEdge'
  paper: 'original' | 'A4' | 'Letter'
  landscape: boolean
  scale: 'fit' | 'actual' | 'shrink' | 'custom'
  customScale?: number
  handling?: 'size' | 'multiple' | 'booklet' | 'poster'
  columns?: number
  rows?: number
  tileScale?: number
  /** Overlap in PDF points (72 points per inch). */
  overlap?: number
  autoRotate?: boolean
  pages: number[]
}
export interface PrinterOption {
  name: string
  displayName: string
  isDefault: boolean
  available?: boolean
  isVirtual?: boolean
}
