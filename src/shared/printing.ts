export interface PrintOptions {
  deviceName: string
  copies: number
  color: boolean
  duplex: 'simplex' | 'longEdge' | 'shortEdge'
  paper: 'original' | 'A4' | 'Letter'
  landscape: boolean
  scale: 'fit' | 'actual'
  pages: number[]
}
export interface PrinterOption {
  name: string
  displayName: string
  isDefault: boolean
  available?: boolean
  isVirtual?: boolean
}
