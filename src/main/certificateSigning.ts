import { PDFDocument, PDFSignature } from 'pdf-lib'
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib'
import { P12Signer } from '@signpdf/signer-p12'
import { SignPdf } from '@signpdf/signpdf'

export async function signPdfWithCertificate(bytes: Uint8Array, certificate: Buffer, password: string, name: string, reason: string): Promise<Uint8Array> {
  const document=await PDFDocument.load(bytes)
  if (document.getForm().getFields().some(field => field instanceof PDFSignature)) throw new Error('This PDF already has a signature field. Adding signatures incrementally is not supported; use the unsigned original.')
  pdflibAddPlaceholder({pdfDoc:document,reason,name,contactInfo:'',location:'',appName:'Re-Edit PDF',signatureLength:32768})
  const prepared=await document.save({useObjectStreams:false})
  const signer=new P12Signer(certificate,{passphrase:password})
  return new Uint8Array(await new SignPdf().sign(Buffer.from(prepared), signer))
}
