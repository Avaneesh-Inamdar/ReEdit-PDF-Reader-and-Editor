import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Configure worker for node (file:// URL required on Windows) — vitest runs in node
try {
  const workerPath = 'file://' + path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').replace(/\\/g,'/')
  // @ts-ignore
  if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
} catch {}

export function fixturePath(name: string): string {
  return path.join(process.cwd(), 'test-fixtures', name)
}

export function loadFixture(name: string): Uint8Array {
  return fs.readFileSync(fixturePath(name))
}

export function loadFixtureBuffer(name: string): ArrayBuffer {
  const u8 = loadFixture(name)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

export async function getPdfJsDoc(data: ArrayBuffer): Promise<InstanceType<typeof pdfjsLib.PDFDocumentProxy>> {
  // @ts-ignore pdf.js types
  const doc = await pdfjsLib.getDocument({ data: data.slice(0), disableWorker: true, verbosity: 0 }).promise
  return doc as never
}

export async function extractText(data: ArrayBuffer): Promise<{ text: string; perPage: string[] }> {
  const doc = await getPdfJsDoc(data)
  const perPage: string[] = []
  let all = ''
  for (let i=1;i<=doc.numPages;i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const txt = (tc.items as unknown as Array<{str:string}>).map(it=> it.str).join(' ')
    perPage.push(txt)
    all += txt + '\n'
  }
  return { text: all, perPage }
}

export async function getPageText(data: ArrayBuffer, pageNum: number): Promise<string> {
  const { perPage } = await extractText(data)
  return perPage[pageNum-1] || ''
}

export async function countImagesRaw(bytes: Uint8Array): Promise<number> {
  const s = new TextDecoder('latin1').decode(bytes)
  return (s.match(/\/Subtype\s*\/Image/g) || []).length
}

export async function getImageByteLengths(bytes: Uint8Array): Promise<number[]> {
  // Approximate: find image streams and their Length values via regex — not precise but for test equality
  const s = new TextDecoder('latin1').decode(bytes)
  const matches = [...s.matchAll(/\/Subtype\s*\/Image[\s\S]*?\/Length\s+(\d+)/g)]
  return matches.map(m=> parseInt(m[1],10)).sort((a,b)=>a-b)
}

export async function hasAnnotationObjects(bytes: Uint8Array): Promise<{ count: number; subtypes: string[] }> {
  // Use pdf-lib to properly decode ObjStm compressed streams
  try {
    const pdf = await PDFDocument.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    const subtypes: string[] = []
    for (const page of pdf.getPages()) {
      const node: unknown = (page as unknown as { node: unknown }).node
      const dict = node as unknown as { has: (k: unknown)=> boolean; get: (k: unknown)=> unknown }
      const { PDFName } = await import('pdf-lib')
      const key = PDFName.of('Annots')
      if (!dict.has(key)) continue
      const annotsRef = dict.get(key)
      if (!annotsRef) continue
      try {
        const ctx: unknown = (pdf as unknown as { context: unknown }).context
        const lookup = (ctx as unknown as { lookup: (r: unknown)=> unknown }).lookup
        const arr = lookup.call(ctx, annotsRef) as unknown as { size?: number; length?: number; get?: (i:number)=> unknown; array?: unknown[] }
        // PDFArray
        const items: unknown[] = []
        if (Array.isArray((arr as { array?: unknown[] }).array)) items.push(...(arr as { array: unknown[] }).array)
        else if (typeof (arr as { get?: unknown }).get === 'function') {
          const a = arr as { size?: number; get: (i:number)=> unknown }
          const sz = a.size ?? 0
          for (let i=0;i<sz;i++) items.push(a.get(i))
        } else if (Array.isArray(arr)) items.push(...(arr as unknown[]))
        for (const ref of items) {
          try {
            const dictObj = (ctx as unknown as { lookup: (r: unknown)=> unknown }).lookup.call(ctx, ref) as unknown as { get?: (k: unknown)=> unknown; has?: (k: unknown)=> boolean }
            if (!dictObj || typeof dictObj.get !== 'function') continue
            const sub = dictObj.get(PDFName.of('Subtype')) as unknown as { value?: string; toString?: ()=> string } | undefined
            if (sub) {
              const val = (sub as { value?: string }).value ?? String(sub)
              // val may be "/Highlight" string; extract name
              const name = String(val).replace('/', '').replace('[object Object]', '')
              // Better: try decode via pdf-lib PDFName decoding
              let clean = name
              if (clean.includes('Highlight')) clean = 'Highlight'
              else if (clean.includes('Underline')) clean = 'Underline'
              else if (clean.includes('StrikeOut')) clean = 'StrikeOut'
              else if (clean.includes('Square')) clean = 'Square'
              else if (clean.includes('Circle')) clean = 'Circle'
              else if (clean.includes('Ink')) clean = 'Ink'
              else if (clean.includes('FreeText')) clean = 'FreeText'
              else if (clean.includes('Redact')) clean = 'Redact'
              else if (clean.includes('Text')) clean = 'Text'
              // Also try direct value decode
              try {
                const decoded = (sub as unknown as { decodeText?: ()=> string }).decodeText?.()
                if (decoded) clean = decoded.replace('/', '')
              } catch {}
              if (['Highlight','Underline','StrikeOut','Square','Circle','Ink','Text','FreeText','Redact'].includes(clean)) subtypes.push(clean)
              else subtypes.push(String(val))
            }
          } catch {}
        }
      } catch {}
    }
    // Fallback to raw search if pdf-lib parsing yielded 0 (maybe compressed but not decoded)
    if (subtypes.length === 0) {
      const s = new TextDecoder('latin1').decode(bytes)
      const annots = [...s.matchAll(/\/Subtype\s*\/(Highlight|Underline|StrikeOut|Square|Circle|Ink|Text|FreeText|Redact)/g)]
      return { count: annots.length, subtypes: annots.map(m=> m[1]) }
    }
    return { count: subtypes.length, subtypes }
  } catch {
    const s = new TextDecoder('latin1').decode(bytes)
    const annots = [...s.matchAll(/\/Subtype\s*\/(Highlight|Underline|StrikeOut|Square|Circle|Ink|Text|FreeText|Redact)/g)]
    return { count: annots.length, subtypes: annots.map(m=> m[1]) }
  }
}

export async function hasAcroFormInBytes(bytes: Uint8Array): Promise<boolean> {
  try {
    const pdf = await PDFDocument.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { ignoreEncryption: true })
    // Try to get form
    try {
      const form = pdf.getForm()
      if (form.getFields().length > 0) return true
    } catch {}
    // Check catalog for AcroForm entry
    const catalog = (pdf as unknown as { catalog: unknown }).catalog as unknown as { has: (k: unknown)=> boolean }
    const { PDFName } = await import('pdf-lib')
    if (catalog.has(PDFName.of('AcroForm'))) return true
  } catch {}
  const s = new TextDecoder('latin1').decode(bytes.slice(0, 80000))
  if (s.includes('/AcroForm')) return true
  // Also search whole file decompressed latin1 (in case compressed)
  const full = new TextDecoder('latin1').decode(bytes)
  return full.includes('/AcroForm')
}
