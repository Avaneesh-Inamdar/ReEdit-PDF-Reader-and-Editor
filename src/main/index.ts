import { app, shell, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'url'
import { join, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { Worker } from 'node:worker_threads'
import { isNewerRelease, releasesUrl } from './updates'
import { normalizeImportedFont } from './fontImport'
import type { RemovalRegion } from '../shared/pdfOperations'
import { signPdfWithCertificate } from './certificateSigning'
import { createWordDocument, convertOfficeToPdf, type WordLine } from './officeConversion'

interface RecentEntry {
  path: string
  name: string
}

const store = new Store<{
  recentFiles: RecentEntry[]
  windowBounds: { width: number; height: number; x?: number; y?: number }
}>({
  defaults: {
    recentFiles: [],
    windowBounds: { width: 1280, height: 800 }
  }
})

let mainWindow: BrowserWindow | null = null
let currentFilePath: string | null = null
let allowClose = false
let rendererReady = false
const pendingPaths: string[] = []

function writePdf(target: string, bytes: Uint8Array): void {
  const temporary = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, Buffer.from(bytes), { flag: 'wx' })
    renameSync(temporary, target)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function openFromShell(args: string[]): void {
  const paths = args.flatMap(arg => {
    try { const path = arg.startsWith('file:') ? fileURLToPath(arg) : arg; return /\.pdf$/i.test(path) && isAbsolute(path) ? [path] : [] } catch { return [] }
  })
  for (const filePath of paths) {
    if (!rendererReady) {
      pendingPaths.push(filePath)
      continue
    }
    try {
      const data = readFileSync(filePath)
      if (mainWindow?.isMinimized()) mainWindow.restore()
      mainWindow?.maximize()
      mainWindow?.show()
      mainWindow?.focus()
      currentFilePath = filePath
      addRecentFile(filePath)
      buildMenu()
      mainWindow?.webContents.send('file:opened', {
        filePath,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      })
    } catch (error) {
      dialog.showErrorBox('Unable to open PDF', String(error))
    }
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  openFromShell(process.argv)
  app.on('second-instance', (_event, args) => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
    openFromShell(args)
  })
}

function addRecentFile(filePath: string): void {
  const name = filePath.split(/[\\/]/).pop() || filePath
  const recent = (store.get('recentFiles') as RecentEntry[]) || []
  const filtered = recent.filter((r) => r.path !== filePath)
  filtered.unshift({ path: filePath, name })
  store.set('recentFiles', filtered.slice(0, 10))
}

function buildMenu(): void {
  const recentFiles = (store.get('recentFiles') as RecentEntry[]) || []
  const recentSubmenu =
    recentFiles.length === 0
      ? [{ label: '(No recent files)', enabled: false }]
      : recentFiles.map((r) => ({
          label: r.name,
          click: async (): Promise<void> => {
            if (!existsSync(r.path)) {
              dialog.showMessageBox(mainWindow!, {
                type: 'warning',
                message: `File not found: ${r.path}`
              })
              return
            }
            currentFilePath = r.path
            addRecentFile(r.path)
            buildMenu()
            const data = readFileSync(r.path)
            mainWindow?.webContents.send('file:opened', {
              filePath: r.path,
              data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            })
          }
        }))

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Convert Office document to PDF…', click: () => mainWindow?.webContents.send('menu:action', 'importOffice') },
        { label: 'Export text to Word…', click: () => mainWindow?.webContents.send('menu:action', 'exportWord') },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: async (): Promise<void> => {
            await handleOpenDialog()
          }
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: (): void => {
            mainWindow?.webContents.send('file:closed')
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: (): void => {
            mainWindow?.webContents.send('menu:action', 'save')
          }
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: (): void => {
            mainWindow?.webContents.send('menu:action', 'saveAs')
          }
        },
        {
          label: 'Export Flattened…',
          click: (): void => {
            mainWindow?.webContents.send('menu:action', 'saveFlattened')
          }
        },
        { type: 'separator' },
        {
          label: 'Recent Files',
          submenu: [
            ...recentSubmenu,
            { type: 'separator' },
            {
              label: 'Clear Recent Files',
              click: (): void => {
                store.set('recentFiles', [])
                buildMenu()
              }
            }
          ] as Electron.MenuItemConstructorOptions[]
        },
        { type: 'separator' },
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.send('menu:action', 'print')
        },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow?.webContents.send('menu:action', 'undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          click: () => mainWindow?.webContents.send('menu:action', 'redo')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: (): void => mainWindow?.webContents.send('menu:action', 'find')
        },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('menu:action', 'preferences')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: (): void => mainWindow?.webContents.send('menu:action', 'zoomIn')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: (): void => mainWindow?.webContents.send('menu:action', 'zoomOut')
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+1',
          click: (): void => mainWindow?.webContents.send('menu:action', 'zoomReset')
        },
        { type: 'separator' },
        {
          label: 'Fit Width',
          accelerator: 'CmdOrCtrl+2',
          click: (): void => mainWindow?.webContents.send('menu:action', 'fitWidth')
        },
        {
          label: 'Fit Page',
          accelerator: 'CmdOrCtrl+0',
          click: (): void => mainWindow?.webContents.send('menu:action', 'fitPage')
        },
        { type: 'separator' },
        ...(is.dev ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        ...[
          ['Edit PDF', 'edit'],
          ['Fill & Sign', 'sign'],
          ['Sign with a Certificate…', 'certificate'],
          ['Fill Forms', 'forms'],
          ['Scan & OCR', 'ocr'],
          ['Organize Pages', 'organize'],
          ['Combine Files…', 'combineFiles']
        ].map(([label, action]) => ({
          label,
          click: () => mainWindow?.webContents.send('menu:action', action)
        })),
        { type: 'separator' },
        {
          label: 'Rotate Clockwise',
          click: (): void => mainWindow?.webContents.send('menu:action', 'rotateCw')
        },
        {
          label: 'Rotate Counter-Clockwise',
          click: (): void => mainWindow?.webContents.send('menu:action', 'rotateCcw')
        },
        { type: 'separator' },
        {
          label: 'Document Properties…',
          click: (): void => mainWindow?.webContents.send('menu:action', 'docProps')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates…', click: () => mainWindow?.webContents.send('menu:action', 'updates') },
        {
          label: 'About Re-Edit PDF',
          click: (): void => {
            mainWindow?.webContents.send('menu:action', 'about')
          }
        },
        { type: 'separator' },
        {
          label: 'GitHub Repository',
          click: (): void => {
            void shell.openExternal(
              'https://github.com/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor'
            )
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

async function handleOpenDialog(): Promise<{ filePath: string; data: ArrayBuffer } | null> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open PDF',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const data = readFileSync(filePath)
  currentFilePath = filePath
  addRecentFile(filePath)
  buildMenu()
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer
  mainWindow?.webContents.send('file:opened', { filePath, data: arrayBuffer })
  return { filePath, data: arrayBuffer }
}

function createWindow(): void {
  const bounds = store.get('windowBounds') as {
    width: number
    height: number
    x?: number
    y?: number
  }
  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Re-Edit PDF',
    icon: join(__dirname, process.platform === 'win32' ? '../../build/icon.ico' : '../../build/icon.png'),
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#09090b',
    fullscreenable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  mainWindow.on('close', (event) => {
    if (!allowClose && rendererReady) {
      event.preventDefault()
      mainWindow?.webContents.send('window:closeRequested')
    }
    if (mainWindow) {
      store.set('windowBounds', mainWindow.getBounds() as never)
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximize-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximize-changed', false))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:/i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('context-menu', (_, params) => {
    const menuTemplate: Electron.MenuItemConstructorOptions[] = []
    if (params.selectionText) {
      menuTemplate.push({ role: 'copy' })
      if (!params.isEditable) menuTemplate.push({label: 'Edit Selected Text…', click: () => mainWindow?.webContents.send('menu:action', 'editSelectedText')})
    }
    if (params.isEditable) {
      if (!params.selectionText) {
        menuTemplate.push({ role: 'cut', enabled: false }, { role: 'copy', enabled: false })
      } else if (!menuTemplate.find((i) => i.role === 'copy')) {
        menuTemplate.push({ role: 'cut' }, { role: 'copy' })
      }
      menuTemplate.push({ role: 'paste' }, { role: 'selectAll' })
    }
    if (menuTemplate.length > 0) {
      Menu.buildFromTemplate(menuTemplate).popup()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  buildMenu()
  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(() => {
  ipcMain.handle('pdf:signCertificate', async (_event, bytes: Uint8Array, password: string, name: string, reason: string) => {
    const picked=await dialog.showOpenDialog(mainWindow!,{title:'Choose signing certificate',properties:['openFile'],filters:[{name:'PKCS#12 certificate',extensions:['p12','pfx']}]})
    if (picked.canceled) return null
    const certificate=readFileSync(picked.filePaths[0])
    try {
      const signed=await signPdfWithCertificate(bytes,certificate,password,name,reason)
      const output=await dialog.showSaveDialog(mainWindow!,{title:'Save signed copy',defaultPath:'signed-document.pdf',filters:[{name:'PDF',extensions:['pdf']}]})
      if (output.canceled || !output.filePath) return null
      writePdf(output.filePath,signed)
      return output.filePath
    } finally {certificate.fill(0)}
  })
  ipcMain.handle('office:exportWord', async (_event, pages: WordLine[][], name: string) => {
    if (!Array.isArray(pages) || pages.length>10000 || pages.some(page => !Array.isArray(page) || page.some(line => typeof line.text!=='string' || !Number.isFinite(line.size)))) throw new Error('Invalid Word document')
    const output=await dialog.showSaveDialog(mainWindow!,{title:'Export editable text to Word',defaultPath:name.replace(/\.pdf$/i,'.docx'),filters:[{name:'Word document',extensions:['docx']}]})
    if (output.canceled || !output.filePath) return null
    writePdf(output.filePath,await createWordDocument(pages))
    return output.filePath
  })
  ipcMain.handle('office:import', async () => {
    const input=await dialog.showOpenDialog(mainWindow!,{title:'Convert Office document to PDF',properties:['openFile'],filters:[{name:'Office document',extensions:['docx','doc','xlsx','xls','pptx','ppt','odt','ods','odp','rtf']}]})
    if (input.canceled) return null
    const bytes=await convertOfficeToPdf(input.filePaths[0])
    const output=await dialog.showSaveDialog(mainWindow!,{title:'Save converted PDF',defaultPath:input.filePaths[0].replace(/\.[^.]+$/,'.pdf'),filters:[{name:'PDF',extensions:['pdf']}]})
    if (output.canceled || !output.filePath) return null
    writePdf(output.filePath,bytes)
    openFromShell([output.filePath])
    return output.filePath
  })
  ipcMain.handle('font:normalize', (_event, bytes: Uint8Array) => normalizeImportedFont(bytes))
  ipcMain.handle('pdf:removeContent', (_event, bytes: Uint8Array, regions: RemovalRegion[], secure: boolean) => new Promise<Uint8Array>((resolve, reject) => {
    if (!(bytes instanceof Uint8Array) || !Array.isArray(regions) || !regions.length || regions.length > 100000) { reject(new Error('Invalid content removal request')); return }
    const worker = new Worker(join(__dirname, 'pdfEngineWorker.js'), { workerData: {bytes, regions, secure: !!secure} })
    const timeout = setTimeout(() => { void worker.terminate(); reject(new Error('PDF content removal timed out.')) }, 120000)
    worker.once('message', result => { clearTimeout(timeout); void worker.terminate(); result.error ? reject(new Error(result.error)) : resolve(result.bytes) })
    worker.once('error', error => { clearTimeout(timeout); reject(error) })
    worker.once('exit', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('PDF worker stopped unexpectedly.')) })
  }))
  let updateRequest: Promise<{current: string; latest?: string; available: boolean; message: string}> | null = null
  ipcMain.handle('app:openReleases', () => shell.openExternal(releasesUrl))
  ipcMain.handle('app:checkUpdates', () => {
    if (updateRequest) return updateRequest
    updateRequest = (async () => {
      const current=app.getVersion()
      try {
        const response=await fetch('https://api.github.com/repos/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor/releases/latest', {headers:{Accept:'application/vnd.github+json','User-Agent':'Re-Edit-PDF'}, signal:AbortSignal.timeout(15000)})
        if (response.status===404) return {current,available:false,message:'No stable release has been published yet.'}
        if (!response.ok) throw new Error(`Release server returned ${response.status}`)
        const release=await response.json() as {tag_name?:string; draft?:boolean; prerelease?:boolean}
        if (release.draft || release.prerelease || !release.tag_name || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error('Invalid release information')
        const available=isNewerRelease(current,release.tag_name)
        return {current,latest:release.tag_name.replace(/^v/,''),available,message:available?'A new version is available. Download the installer from GitHub Releases.':'You have the latest stable version.'}
      } catch { return {current,available:false,message:'Unable to check for updates. Check your connection and try again.'} }
    })().finally(() => { updateRequest=null })
    return updateRequest
  })
  electronApp.setAppUserModelId('com.avaneeshinamdar.readitpdf')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('window:documentTitle', (_event, title: string) =>
    mainWindow?.setTitle(title.slice(0, 300))
  )
  ipcMain.handle('system:defaultApps', async () => {
    if (process.platform === 'win32') return shell.openExternal('ms-settings:defaultapps')
    if (process.platform === 'linux') {
      const execute=promisify(execFile)
      if (/gnome|unity/i.test(process.env.XDG_CURRENT_DESKTOP || '')) {
        try {
          await execute('gio', ['mime', 'application/pdf', 're-edit-pdf.desktop'])
          const result=await execute('gio', ['mime', 'application/pdf'])
          if (!result.stdout.split('\n')[0].trim().endsWith('re-edit-pdf.desktop')) throw new Error('Your desktop did not accept the PDF default. Choose it in system application settings.')
          return
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
      await execute('xdg-mime', ['default', 're-edit-pdf.desktop', 'application/pdf'])
      const result=await execute('xdg-mime', ['query', 'default', 'application/pdf'])
      if (result.stdout.trim() !== 're-edit-pdf.desktop') throw new Error('Your desktop did not accept the PDF default. Choose it in system application settings.')
      return
    }
    throw new Error('Choose Re-Edit PDF in your system file association settings.')
  })
  ipcMain.handle('dialog:saveAttachment', async (_event, bytes: Uint8Array, name: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save attachment',
      defaultPath: name.split(/[\\/]/).pop() || 'attachment',
      filters: [{ name: 'All files', extensions: ['*'] }]
    })
    if (result.canceled || !result.filePath) return null
    writePdf(result.filePath, bytes)
    return result.filePath
  })
  ipcMain.handle('dialog:pickPdfs', async () => {
    const picked = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose PDF files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
    })
    if (picked.canceled) return []
    return picked.filePaths.map((filePath) => {
      const data = readFileSync(filePath)
      return {
        filePath,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      }
    })
  })
  ipcMain.handle('renderer:ready', () => {
    rendererReady = true
    openFromShell(pendingPaths.splice(0))
  })
  ipcMain.handle('dialog:confirmClose', async (_event, name: string) => {
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      title: 'Unsaved changes',
      message: `Save changes to "${name}"?`,
      buttons: ['Save', 'Don’t Save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    return ['save', 'discard', 'cancel'][result.response]
  })
  ipcMain.handle('window:forceClose', () => {
    allowClose = true
    mainWindow?.close()
  })

  // IPC handlers
  ipcMain.handle('dialog:openPdf', async () => {
    const res = await handleOpenDialog()
    return res
  })

  ipcMain.handle(
    'dialog:savePdf',
    async (_event, bytes: Uint8Array, defaultName?: string, filePath?: string) => {
      const savePath = filePath && isAbsolute(filePath) ? filePath : null
      let target = savePath
      if (!target) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          title: 'Save PDF',
          defaultPath: defaultName || 'document.pdf',
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return null
        target = result.filePath
      }
      try {
        writePdf(target, bytes)
        currentFilePath = target
        addRecentFile(target)
        buildMenu()
        return target
      } catch (e) {
        dialog.showErrorBox('Save failed', String(e))
        return null
      }
    }
  )

  ipcMain.handle('dialog:savePdfAs', async (_event, bytes: Uint8Array, defaultName?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save PDF As',
      defaultPath: defaultName || currentFilePath || 'document.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    try {
      writePdf(result.filePath, bytes)
      currentFilePath = result.filePath
      addRecentFile(result.filePath)
      buildMenu()
      return result.filePath
    } catch (e) {
      dialog.showErrorBox('Save failed', String(e))
      return null
    }
  })

  ipcMain.handle('fs:readPdf', async (_event, filePath: string) => {
    if (!existsSync(filePath)) throw new Error('File not found')
    const data = readFileSync(filePath)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  })

  ipcMain.handle('store:getRecent', () => {
    return store.get('recentFiles')
  })
  ipcMain.handle('store:removeRecent', (_event, path: string) => {
    store.set('recentFiles', store.get('recentFiles').filter(file => file.path !== path))
    buildMenu()
  })

  ipcMain.handle('store:getCurrentPath', () => currentFilePath)

  // frameless window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle(
    'window:print',
    async (_event, pages: { image: string; width: number; height: number }[]) => {
      if (
        !Array.isArray(pages) ||
        !pages.length ||
        pages.some(
          (p) =>
            !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image) ||
            !Number.isFinite(p.width) ||
            !Number.isFinite(p.height) ||
            p.width <= 0 ||
            p.height <= 0
        )
      )
        throw new Error('Invalid print document')
      const path = join(app.getPath('temp'), `readit-print-${randomUUID()}.html`)
      const printWindow = new BrowserWindow({
        show: false,
        parent: mainWindow!,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
      })
      try {
        const styles = pages
          .map((p, i) => `@page sheet${i} { size: ${p.width}pt ${p.height}pt; margin: 0; }`)
          .join('')
        const sheets = pages
          .map(
            (p, i) =>
              `<section style="page:sheet${i};width:${p.width}pt;height:${p.height}pt"><img src="${p.image}"></section>`
          )
          .join('')
        writeFileSync(
          path,
          `<!doctype html><html><head><title>Re-Edit PDF</title><style>${styles}*{box-sizing:border-box}html,body{margin:0;padding:0}section{break-after:page;overflow:hidden}section:last-child{break-after:auto}img{display:block;width:100%;height:100%}</style></head><body>${sheets}</body></html>`
        )
        await printWindow.loadFile(path)
        await printWindow.webContents.executeJavaScript(
          'Promise.all(Array.from(document.images, img => img.decode()))'
        )
        await new Promise<void>((resolve, reject) =>
          printWindow.webContents.print(
            { silent: false, printBackground: true, margins: { marginType: 'none' } },
            (ok, reason) => {
              if (ok || /cancel/i.test(reason)) resolve()
              else reject(new Error(reason || 'Printer unavailable'))
            }
          )
        )
      } finally {
        printWindow.destroy()
        if (existsSync(path)) unlinkSync(path)
      }
    }
  )

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
