import { app, shell, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

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
            currentFilePath = null
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
          submenu: [...recentSubmenu, { type: 'separator' }, { label: 'Clear Recent Files', click: (): void => { store.set('recentFiles', []); buildMenu() } }] as Electron.MenuItemConstructorOptions[]
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: (): void => mainWindow?.webContents.send('menu:action', 'find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: (): void => mainWindow?.webContents.send('menu:action', 'zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: (): void => mainWindow?.webContents.send('menu:action', 'zoomOut') },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: (): void => mainWindow?.webContents.send('menu:action', 'zoomReset') },
        { type: 'separator' },
        { label: 'Fit Width', accelerator: 'Ctrl+Shift+W', click: (): void => mainWindow?.webContents.send('menu:action', 'fitWidth') },
        { label: 'Fit Page', accelerator: 'Ctrl+Shift+P', click: (): void => mainWindow?.webContents.send('menu:action', 'fitPage') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Rotate Clockwise', click: (): void => mainWindow?.webContents.send('menu:action', 'rotateCw') },
        { label: 'Rotate Counter-Clockwise', click: (): void => mainWindow?.webContents.send('menu:action', 'rotateCcw') },
        { type: 'separator' },
        { label: 'Document Properties…', click: (): void => mainWindow?.webContents.send('menu:action', 'docProps') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Readit PDF Reader and Editor', click: (): void => { void dialog.showMessageBox(mainWindow!, { type: 'info', title: 'About Readit PDF Reader and Editor', message: 'Readit PDF Reader and Editor v1.0.0\nCreated by Avaneesh Inamdar\nWindows PDF Reader & Editor\nBuilt with Electron + pdf.js + pdf-lib' }) } },
        { type: 'separator' },
        { label: 'GitHub Repository', click: (): void => { void shell.openExternal('https://github.com/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor') } }
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
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  mainWindow?.webContents.send('file:opened', { filePath, data: arrayBuffer })
  return { filePath, data: arrayBuffer }
}

function createWindow(): void {
  const bounds = store.get('windowBounds') as { width: number; height: number; x?: number; y?: number }
  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: false,
    title: 'PDF Editor',
    icon: join(__dirname, '../../build/icon.ico'),
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    backgroundColor: '#09090b',
    fullscreenable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  })

  mainWindow.on('close', () => {
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
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('context-menu', (_, params) => {
    const menuTemplate: Electron.MenuItemConstructorOptions[] = []
    if (params.selectionText) {
      menuTemplate.push({ role: 'copy' })
    }
    if (params.isEditable) {
      if (!params.selectionText) {
        menuTemplate.push({ role: 'cut', enabled: false }, { role: 'copy', enabled: false })
      } else if (!menuTemplate.find(i => i.role === 'copy')) {
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
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pdfeditor.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers
  ipcMain.handle('dialog:openPdf', async () => {
    const res = await handleOpenDialog()
    return res
  })

  ipcMain.handle('dialog:savePdf', async (_event, bytes: Uint8Array, defaultName?: string) => {
    const savePath = currentFilePath
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
      writeFileSync(target, Buffer.from(bytes))
      currentFilePath = target
      addRecentFile(target)
      buildMenu()
      return target
    } catch (e) {
      dialog.showErrorBox('Save failed', String(e))
      return null
    }
  })

  ipcMain.handle('dialog:savePdfAs', async (_event, bytes: Uint8Array, defaultName?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save PDF As',
      defaultPath: defaultName || currentFilePath || 'document.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    try {
      writeFileSync(result.filePath, Buffer.from(bytes))
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
  ipcMain.handle('window:print', () => mainWindow?.webContents.print())

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
