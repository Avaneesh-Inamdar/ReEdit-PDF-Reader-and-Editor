export interface RemovalRegion {
  page: number
  annotationId?: string
  removeImageText?: boolean
  quad?: [number, number, number, number, number, number, number, number]
  x?: number
  y?: number
  w?: number
  h?: number
}
