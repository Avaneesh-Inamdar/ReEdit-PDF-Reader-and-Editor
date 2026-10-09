import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useEditStore } from '../stores/useEditStore'
import { useUIStore } from '../stores/useUIStore'

// Normalize uploaded signatures to PNG so preview and PDF export use identical pixels.
export async function placeImage(dataUrl: string, widthNorm = 0.25): Promise<void> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  const preview = canvas.toDataURL('image/png')
  const bytes = Uint8Array.from(atob(preview.split(',')[1]), (c) => c.charCodeAt(0))
  useEditStore
    .getState()
    .setPendingImage({
      bytes,
      mime: 'image/png',
      dataUrl: preview,
      widthNorm,
      aspectRatio: canvas.width / canvas.height
    })
  useUIStore.getState().setPointerMode('select')
  useAnnotationStore.getState().setTool('image')
}

export function placeMark(mark: string): void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = ctx.fillStyle = '#111111'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (mark === 'check') {
    ctx.moveTo(10, 32)
    ctx.lineTo(26, 48)
    ctx.lineTo(54, 14)
  } else if (mark === 'x') {
    ctx.moveTo(14, 14)
    ctx.lineTo(50, 50)
    ctx.moveTo(50, 14)
    ctx.lineTo(14, 50)
  } else if (mark === 'dot') {
    ctx.arc(32, 32, 8, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.moveTo(8, 32)
    ctx.lineTo(56, 32)
  }
  ctx.stroke()
  void placeImage(canvas.toDataURL('image/png'), 0.04)
}
