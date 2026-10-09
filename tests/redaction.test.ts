import {describe,it,expect} from 'vitest'
import {PDFDocument,StandardFonts,degrees} from 'pdf-lib'
import {removePdfContent} from '../src/main/pdfEngine'
import {extractText} from './helpers'
const text = async (bytes:Uint8Array):Promise<string> => (await extractText(bytes.slice().buffer as ArrayBuffer)).text
async function fixture(rotation=0):Promise<Uint8Array> {
 const doc=await PDFDocument.create();const page=doc.addPage([400,400]);const font=await doc.embedFont(StandardFonts.Helvetica)
 page.drawText('SECRET',{x:40,y:300,size:20,font});page.drawText('KEEP',{x:250,y:300,size:20,font});page.setRotation(degrees(rotation));doc.setTitle('SECRET');return doc.save()
}
describe('real content removal',()=>{
 it('removes covered form values from the form dictionary and page content',async()=>{
  const doc=await PDFDocument.create();const page=doc.addPage([400,400]);const field=doc.getForm().createTextField('secret');field.setText('SECRET');field.addToPage(page,{x:40,y:250,width:120,height:40})
  const bytes=await removePdfContent(await doc.save(),[{page:1,x:.07,y:.24,w:.4,h:.18}],true)
  expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0)
  expect(await text(bytes)).not.toContain('SECRET')
 })
 it('removes sensitive pixels from the embedded image itself, rather than covering them',async()=>{
  const m=await import('mupdf')
  const pixmap=new m.Pixmap(m.ColorSpace.DeviceRGB,[0,0,100,100],false)
  const pixels=pixmap.getPixels();for(let i=0;i<pixels.length;i+=3){pixels[i]=255;pixels[i+1]=0;pixels[i+2]=0}
  const doc=await PDFDocument.create();const page=doc.addPage([400,400]);const image=await doc.embedPng(pixmap.asPNG());pixmap.destroy()
  page.drawImage(image,{x:40,y:200,width:100,height:100})
  const bytes=await removePdfContent(await doc.save(),[{page:1,x:.2,y:.3,w:.1,h:.1}],true)
  const clean=new m.PDFDocument(bytes);const cleanPage=clean.loadPage(0);const structured=cleanPage.toStructuredText('preserve-images=yes')
  let checked=false
  structured.walk({onImageBlock(_box,_matrix,embedded){const p=embedded.toPixmap();const values=p.getPixels(),components=p.getNumberOfComponents();const inside=40*p.getStride()+50*components;expect(Array.from(values.slice(inside,inside+3))).not.toEqual([255,0,0]);expect(Array.from(values.slice(0,3))).toEqual([255,0,0]);checked=true;p.destroy()}})
  expect(checked).toBe(true);structured.destroy();cleanPage.destroy();clean.destroy()
 })
 it('removes original text operators and metadata, preserving unrelated text',async()=>{
  const bytes=await removePdfContent(await fixture(),[{page:1,x:.09,y:.19,w:.30,h:.10}],true)
  expect(await text(bytes)).not.toContain('SECRET');expect(await text(bytes)).toContain('KEEP')
  const doc=await PDFDocument.load(bytes);expect(doc.getTitle()).toBeUndefined()
 })
 it.each([0,90,180,270])('removes edited text using PDF coordinates on a page rotated %i degrees',async(rotation)=>{
  const bytes=await removePdfContent(await fixture(rotation),[{page:1,quad:[40,321,124,321,40,295,124,295]}],false)
  expect(await text(bytes)).not.toContain('SECRET');expect(await text(bytes)).toContain('KEEP')
 })
 it('rejects invalid pages and regions instead of silently saving unsafe output',async()=>{
  await expect(removePdfContent(await fixture(),[{page:2,x:0,y:0,w:1,h:1}],true)).rejects.toThrow('Invalid removal page')
  await expect(removePdfContent(await fixture(),[{page:1,x:0,y:0,w:-1,h:1}],true)).rejects.toThrow('Invalid redaction region')
 })
})
