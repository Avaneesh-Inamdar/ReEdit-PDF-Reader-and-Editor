import { pdfjsLib, pdfAssetOptions } from './pdfjs'
import { prepareDocument } from './documentActions'
import { usePdfStore } from '../stores/usePdfStore'
import { appChoice } from './appDialogs'

export async function exportWord(): Promise<void> {
  if (usePdfStore.getState().authenticationId && await appChoice('Export protected PDF', 'The Word document will be an unprotected copy. Choose a new file name to keep the protected source.', [{value:'cancel',label:'Cancel'},{value:'continue',label:'Export copy',primary:true}]) !== 'continue') return
  let doc: import('pdfjs-dist').PDFDocumentProxy | undefined
  try {
    doc=await pdfjsLib.getDocument({data:await prepareDocument(true),...pdfAssetOptions}).promise
    const pages:{text:string;size:number}[][]=[]
    for(let n=1;n<=doc.numPages;n++) {
      const page=await doc.getPage(n)
      const content=await page.getTextContent()
      const lines:{text:string;size:number}[]=[]
      let previousY=NaN
      for(const item of content.items) {
        if (!('str' in item)) continue
        const size=Math.hypot(item.transform[2],item.transform[3]) || 12
        if (lines.length && Math.abs(item.transform[5]-previousY)<size*.25) lines[lines.length-1].text+=' '+item.str
        else lines.push({text:item.str,size})
        previousY=item.transform[5]
      }
      pages.push(lines.length ? lines : [{text:'',size:12}]);page.cleanup()
    }
    await window.api.exportWord(pages,usePdfStore.getState().fileName || 'document.pdf')
  } catch(error) {alert('Word export failed: '+String(error))} finally {await doc?.destroy()}
}
