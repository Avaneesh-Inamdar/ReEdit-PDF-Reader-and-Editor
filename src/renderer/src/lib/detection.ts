import { pdfjsLib } from './pdfjs'
import type { DetectionInfo } from '../stores/useDetectionStore'

export async function analyzeDocument(data: ArrayBuffer): Promise<DetectionInfo> {
  const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  let textChars = 0
  const fonts = new Set<string>()
  const metadata: Record<string, string> = {}
  try {
    const md = await doc.getMetadata().catch(() => null) as unknown as { info?: Record<string,string> } | null
    if (md?.info) Object.entries(md.info).forEach(([k,v])=> metadata[k]= String(v))
  } catch {}
  let hasXfa = false, hasAcroForm = false, isEncrypted = false
  // scan first bytes for tags
  try {
    const head = new TextDecoder().decode(new Uint8Array(data).slice(0, 60000))
    if (head.includes('/XFA')) hasXfa = true
    if (head.includes('/AcroForm')) hasAcroForm = true
    if (head.includes('/Encrypt')) isEncrypted = true
  } catch {}

  for (let i=1;i<=doc.numPages;i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent().catch(()=> ({ items: [] } as unknown as { items: unknown[] }))
    for (const it of tc.items as unknown as Array<{str:string}>) textChars += (it.str?.length ?? 0)
    // fonts via getOperatorList? approximate via commonObjs
    try {
      await page.getOperatorList().catch(()=>null)
      // fonts are in page.commonObjs; we can peek via doc.commonObjs? simplified: use textContent styles
      const styles = (tc as unknown as { styles?: Record<string,{fontFamily:string}> }).styles
      if (styles) Object.values(styles).forEach(s=> fonts.add(s.fontFamily))
    } catch {}
  }
  const avgCharsPerPage = doc.numPages ? Math.round(textChars / doc.numPages) : 0
  const isScanned = avgCharsPerPage < 100 // heuristic: <100 chars/page → likely scanned
  const isFlat = !hasAcroForm && !hasXfa
  return {
    isScanned, textChars, avgCharsPerPage, numFonts: fonts.size, fonts: [...fonts].slice(0,20),
    metadata, isEncrypted, hasXfa, hasAcroForm, isFlat
  }
}
