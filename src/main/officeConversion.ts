import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Document, Packer, Paragraph, TextRun } from 'docx'

export interface WordLine {text:string; size:number}
export async function createWordDocument(pages: WordLine[][]): Promise<Uint8Array> {
  const document=new Document({sections:pages.map((lines,index)=>({children:lines.map((line,i)=>new Paragraph({pageBreakBefore:index>0 && i===0,children:[new TextRun({text:line.text,size:Math.max(12,Math.min(144,Math.round(line.size*2)))})]}))}))})
  return new Uint8Array(await Packer.toBuffer(document))
}
export async function convertOfficeToPdf(source: string): Promise<Uint8Array> {
  const candidates=process.platform==='win32' ? [join(process.env.ProgramFiles||'C:/Program Files','LibreOffice/program/soffice.exe'),join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','LibreOffice/program/soffice.exe')] : ['/usr/bin/libreoffice','/usr/bin/soffice','/snap/bin/libreoffice']
  const executable=candidates.find(existsSync)
  if (!executable) throw new Error('Office-to-PDF conversion requires LibreOffice. Install it from libreoffice.org, then try again.')
  const directory=await mkdtemp(join(tmpdir(),'re-edit-office-'))
  try {
    const output=join(directory,'output');await mkdir(output)
    const input=join(directory,'input'+source.substring(source.lastIndexOf('.')).toLowerCase())
    await writeFile(input,await readFile(source))
    await new Promise<void>((resolve,reject)=>execFile(executable,[`-env:UserInstallation=${pathToFileURL(join(directory,'profile')).href}`,'--headless','--convert-to','pdf','--outdir',output,input],{timeout:120000,windowsHide:true,maxBuffer:1024*1024},error=>error?reject(error):resolve()))
    const file=(await readdir(output)).find(name=>name.endsWith('.pdf'))
    if (!file) throw new Error('LibreOffice could not convert this document.')
    return new Uint8Array(await readFile(join(output,file)))
  } finally {await rm(directory,{recursive:true,force:true})}
}
