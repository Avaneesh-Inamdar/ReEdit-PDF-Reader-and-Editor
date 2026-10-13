import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { PdfApi, PdfOpenResult } from '../../../preload'
import {fileDialog} from './fileDialog'
import {nativeFileDialog} from './nativeFileDialog'
import {appChoice,appNotice} from './appDialogs'

const subscriptions = new Set<Promise<UnlistenFn>>()
function on<T>(event: string, callback: (payload: T) => void): () => void {
  let disposed = false
  let remove: UnlistenFn | undefined
  const promise = listen<T>(event, (e) => {
    if (!disposed) callback(e.payload)
  }).then((fn) => {
    if (disposed) fn()
    else remove = fn
    return fn
  })
  subscriptions.add(promise)
  void promise.finally(() => subscriptions.delete(promise)).catch(reportError)
  return () => {
    disposed = true
    remove?.()
  }
}
async function bytes(
  command: string,
  input: Uint8Array,
  options: unknown = {}
): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>(command, input, {
    headers: { 'x-reedit-options': encodeURIComponent(JSON.stringify(options)) }
  })
}
async function opened(filePath: string | null): Promise<PdfOpenResult | null> {
  if (!filePath) return null
  let pending = reads.get(filePath)
  if (!pending) {
    pending = invoke<ArrayBuffer>('read_pdf', { filePath })
    reads.set(filePath, pending)
    void pending.finally(() => reads.delete(filePath)).catch(() => {})
  }
  return { filePath, data: await pending }
}
const reads = new Map<string, Promise<ArrayBuffer>>()
let fontList:ReturnType<PdfApi['getSystemFonts']>|undefined
function reportError(error: unknown): void {
  window.dispatchEvent(new CustomEvent('desktop:error', { detail: String(error) }))
}

// The renderer keeps its existing desktop API and UI. Only the transport and
// native service implementation change between the legacy and Rust builds.
export function installDesktopBridge(): void {
  if (!isTauri()) return
  window.alert=appNotice
  document.addEventListener('click',event=>{
    const input=event.target
    if(!(input instanceof HTMLInputElement)||input.type!=='file')return
    event.preventDefault();event.stopImmediatePropagation()
    const extensions=input.accept.split(',').flatMap(item=>item.trim().startsWith('.')?[item.trim().slice(1)]:item.startsWith('image/')?['png','jpg','jpeg','webp','bmp','tif','tiff','gif','svg']:[])
    void nativeFileDialog({title:'Choose file',extensions,multiple:input.multiple}).then(async paths=>{
      if(!paths)return;const transfer=new DataTransfer()
      for(const path of paths){const data=await invoke<ArrayBuffer>('read_pdf',{filePath:path}),name=path.split(/[\\/]/).at(-1)!;const extension=name.split('.').at(-1)!.toLowerCase();const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',pdf:'application/pdf',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};const file=new File([data],name,{type:types[extension]||'application/octet-stream'});Object.defineProperty(file,'path',{value:path});transfer.items.add(file)}
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))
    }).catch(appNotice)
  },true)
  const pickPdf=async():Promise<PdfOpenResult|null>=>{
    try{
      const paths=await nativeFileDialog({title:'Open PDF',extensions:['pdf']})
      if(!paths)return null
      return await opened(await invoke<string>('open_chosen_pdf',{path:paths[0]}))
    }catch(error){appNotice(String(error));return null}
  }
  const save=async(input:Uint8Array,defaultName?:string,filePath?:string,saveAs=false):Promise<string|null>=>{
    let chosenPath:string|undefined
    if(saveAs||!filePath||!/[\\/]/.test(filePath)){const paths=await fileDialog({title:'Save PDF',save:true,name:defaultName||'document.pdf',extensions:['pdf']});if(!paths)return null;chosenPath=paths[0]}
    return invoke('save_pdf',input,{headers:{'x-reedit-options':encodeURIComponent(JSON.stringify({defaultName,filePath,saveAs,chosenPath}))}})
  }
  const attachment=async(input:Uint8Array,name:string):Promise<string|null>=>{const paths=await fileDialog({title:'Save file',save:true,name});if(!paths)return null;return invoke('save_attachment',input,{headers:{'x-reedit-options':encodeURIComponent(JSON.stringify({name,chosenPath:paths[0]}))}})}
  on<string>('desktop:error', reportError)
  on<number>('input:pinch',factor=>window.dispatchEvent(new CustomEvent('desktop:pinch',{detail:factor})))
  const platform = navigator.userAgent.includes('Windows')
    ? 'win32'
    : navigator.userAgent.includes('Macintosh')
      ? 'darwin'
      : 'linux'
  const api: PdfApi = {
    platform,
    signCertificate: async(input,password,name,reason)=>{
      const certificate=await nativeFileDialog({title:'Choose signing certificate',extensions:['p12','pfx']});if(!certificate)return null;
      const output=await fileDialog({title:'Save signed PDF',save:true,name:'signed.pdf',extensions:['pdf']});if(!output)return null;
      return invoke('sign_certificate',input,{headers:{'x-reedit-options':encodeURIComponent(JSON.stringify({password,name,reason,certificatePath:certificate[0],chosenPath:output[0]}))}})
    },
    exportWord: async(pages,name)=>attachment(new Uint8Array(await invoke<ArrayBuffer>('export_word_bytes',{pages})),name.replace(/\.pdf$/i,'')+'.docx'),
    importOffice: async()=>{
      const source=await nativeFileDialog({title:'Office document to PDF',extensions:['docx','doc','odt','rtf','xlsx','xls','pptx','ppt']});if(!source)return null;
      const data=new Uint8Array(await invoke<ArrayBuffer>('import_office_bytes',{filePath:source[0]}));
      const saved=await attachment(data,source[0].split(/[\\/]/).at(-1)!.replace(/\.[^.]+$/,'')+'.pdf');
      if(saved)await invoke('open_chosen_pdf',{path:saved});return saved
    },
    removePdfContent: async (input, regions, secure) =>
      new Uint8Array(await bytes('remove_pdf_content', input, { regions, secure })),
    normalizeImportedFont: async (input) => new Uint8Array(await bytes('normalize_font', input)),
    getSystemFonts: () => fontList ||= invoke<Awaited<ReturnType<PdfApi['getSystemFonts']>>>('system_fonts').catch(error=>{fontList=undefined;throw error}),
    readSystemFont: async (id) =>
      new Uint8Array(await invoke<ArrayBuffer>('read_system_font', { id })),
    checkForUpdates: () => invoke('check_updates'),
    openReleases: () => invoke('open_releases'),
    openFile: pickPdf,
    saveFile: (input,name,path)=>save(input,name,path),
    saveFileAs: (input,name)=>save(input,name,undefined,true),
    getRecentFiles: () => invoke('recent_files'),
    removeRecentFile: (path) => invoke('remove_recent', { path }),
    readPdf: (filePath) => invoke('read_pdf', { filePath }),
    confirmClose: name=>appChoice('Unsaved changes',`Save changes to “${name}” before closing?`,[{value:'cancel',label:'Cancel'},{value:'discard',label:'Don’t save'},{value:'save',label:'Save',primary:true}]) as Promise<'save'|'discard'|'cancel'>,
    onCloseRequested: (callback) => on('window:closeRequested', callback),
    forceClose: () => invoke('force_close'),
    ready: async () => {
      await Promise.all(subscriptions)
      await invoke('renderer_ready')
    },
    setDocumentTitle: (title) => invoke('set_title', { title }),
    openDefaultApps: () => invoke('open_default_apps'),
    pickPdfs: async () => {
      const paths = await nativeFileDialog({title:'Choose PDF files',extensions:['pdf'],multiple:true}) || []
      return Promise.all(
        paths.map(async (filePath) => ({
          filePath,
          data: await invoke<ArrayBuffer>('read_pdf', { filePath })
        }))
      )
    },
    saveAttachment: attachment,
    getCurrentPath: () => invoke('current_path'),
    onFileOpened: (callback) =>
      on<string>('file:opened', (filePath) => {
        void opened(filePath)
          .then((file) => file && callback(file))
          .catch((error) => {
            window.dispatchEvent(new CustomEvent('desktop:error', { detail: String(error) }))
          })
      }),
    onFileClosed: (callback) => on('file:closed', callback),
    onMenuAction: (callback) => on('menu:action', callback),
    minimize: () => invoke('minimize'),
    maximize: () => invoke('maximize'),
    close: () => invoke('request_close'),
    getPrinters: () => invoke('printers'),
    print: (pages, options) => invoke('print_images', { pages, options }),
    beginPrint:input=>invoke('begin_print',input),
    previewPrint:(id,options,sheet)=>invoke('preview_print',{id,options,sheet}),
    submitPrint:(id,options)=>invoke('submit_print',{id,options}),
    exportPrint:async(id,options)=>new Uint8Array(await invoke<ArrayBuffer>('export_print',{id,options})),
    closePrint:id=>invoke('close_print',{id}),
    restartApp:()=>invoke('restart_app'),
    ...(platform==='win32'?{resetPageScale:()=>invoke<void>('reset_page_scale')}:{}),
    printPdf: (input, options) =>
      invoke('print_pdf', input, {
        headers: { 'x-reedit-options': encodeURIComponent(JSON.stringify(options)) }
      }),
    isMaximized: () => invoke('is_maximized'),
    onMaximizeChanged: (callback) => on<boolean>('window:maximize-changed', callback)
  }
  window.api = api
}
