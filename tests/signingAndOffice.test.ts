import {describe,it,expect} from 'vitest'
import forge from 'node-forge'
import {PDFDocument} from 'pdf-lib'
import {extractSignature} from '@signpdf/utils'
import {signPdfWithCertificate} from '../src/main/certificateSigning'
import {createWordDocument,convertOfficeToPdf} from '../src/main/officeConversion'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {extractText} from './helpers'

describe('certificate signing',()=>{
 it('creates a verifiable detached signature and rejects wrong passwords or already signed PDFs',async()=>{
  const keys=forge.pki.rsa.generateKeyPair(2048)
  const cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='01';cert.validity.notBefore=new Date();cert.validity.notAfter=new Date(Date.now()+86400000)
  const attributes=[{name:'commonName',value:'Re-Edit automated test only'}];cert.setSubject(attributes);cert.setIssuer(attributes);cert.sign(keys.privateKey,forge.md.sha256.create())
  const p12=Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'test-password',{algorithm:'3des'})).getBytes(),'binary')
  const doc=await PDFDocument.create();doc.addPage();const original=await doc.save()
  const signed=await signPdfWithCertificate(original,p12,'test-password','Test','Approval')
  const extracted=extractSignature(Buffer.from(signed))
  expect(extracted.ByteRange[2]+extracted.ByteRange[3]).toBe(signed.length)
  const p7=forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(extracted.signature))
  const raw=p7.rawCapture
  const attributesAsn1=forge.asn1.create(forge.asn1.Class.UNIVERSAL,forge.asn1.Type.SET,true,raw.authenticatedAttributes)
  const digest=forge.md.sha256.create();digest.update(forge.asn1.toDer(attributesAsn1).getBytes())
  expect(cert.publicKey.verify(digest.digest().getBytes(),raw.signature)).toBe(true)
  const dataDigest=forge.md.sha256.create();dataDigest.update(extracted.signedData.toString('binary'))
  const messageDigest=raw.authenticatedAttributes.find(attribute=>forge.asn1.derToOid(attribute.value[0].value)===forge.pki.oids.messageDigest)
  expect(messageDigest.value[1].value[0].value).toBe(dataDigest.digest().getBytes())
  await expect(signPdfWithCertificate(original,p12,'wrong','Test','Approval')).rejects.toThrow()
  await expect(signPdfWithCertificate(signed,p12,'test-password','Test','Approval')).rejects.toThrow('already has a signature')
 },20000)
})
describe('Office conversion',()=>{
 it('creates an editable Word document containing the supplied text',async()=>{
  const bytes=await createWordDocument([[{text:'Editable document',size:24},{text:'Body paragraph',size:12}]])
  expect(bytes[0]).toBe(0x50);expect(bytes[1]).toBe(0x4b)
  const {unzipSync}=await import('fflate');const files=unzipSync(bytes)
  const xml=new TextDecoder().decode(files['word/document.xml']);expect(xml).toContain('Editable document');expect(xml).toContain('Body paragraph')
 })
 it.skipIf(!process.env.READIT_TEST_OFFICE)('converts a real Word document to PDF through LibreOffice',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'re-edit-conversion-test-'))
  try {const source=join(directory,'input.docx');await writeFile(source,await createWordDocument([[{text:'Office conversion round trip',size:18}]]));const pdf=await convertOfficeToPdf(source);expect((await extractText(pdf.slice().buffer as ArrayBuffer)).text).toContain('Office conversion round trip')}
  finally {await rm(directory,{recursive:true,force:true})}
 },120000)
})
