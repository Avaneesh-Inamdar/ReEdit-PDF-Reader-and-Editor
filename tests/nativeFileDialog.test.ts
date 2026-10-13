import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { fileDialog } from '../src/renderer/src/lib/fileDialog'
import { appNotice } from '../src/renderer/src/lib/appDialogs'
import { installDesktopBridge } from '../src/renderer/src/lib/desktopBridge'
import { nativeFileDialog } from '../src/renderer/src/lib/nativeFileDialog'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('../src/renderer/src/lib/fileDialog', () => ({ fileDialog: vi.fn() }))
vi.mock('../src/renderer/src/lib/appDialogs', () => ({ appChoice: vi.fn(), appNotice: vi.fn() }))

const call = vi.mocked(invoke)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { addEventListener: vi.fn() })
  vi.stubGlobal('navigator', { userAgent: 'Windows' })
  installDesktopBridge()
})

describe('native Open file workflow', () => {
  it('opens a selected PDF without launching the app file browser', async () => {
    const data = new ArrayBuffer(12)
    call.mockImplementation(async (command) => {
      if (command === 'pick_files_native') return ['C:\\chosen.pdf']
      if (command === 'open_chosen_pdf') return 'C:\\chosen.pdf'
      if (command === 'read_pdf') return data
      throw new Error(`Unexpected command: ${command}`)
    })
    expect(await window.api.openFile()).toEqual({ filePath: 'C:\\chosen.pdf', data })
    expect(call).toHaveBeenNthCalledWith(1, 'pick_files_native', {
      title: 'Open PDF',
      extensions: ['pdf'],
      multiple: false
    })
    expect(fileDialog).not.toHaveBeenCalled()
  })

  it('cancels without starting another dialog or opening a file', async () => {
    call.mockResolvedValue([])
    expect(await window.api.openFile()).toBeNull()
    expect(call).toHaveBeenCalledTimes(1)
    expect(fileDialog).not.toHaveBeenCalled()
    expect(appNotice).not.toHaveBeenCalled()
  })

  it.each(['pick_files_native', 'open_chosen_pdf', 'read_pdf'])(
    'reports a %s failure without switching to the app file browser',
    async (failing) => {
      call.mockImplementation(async (command) => {
        if (command === failing) throw new Error('File operation failed')
        if (command === 'pick_files_native') return ['C:\\chosen.pdf']
        return 'C:\\chosen.pdf'
      })
      expect(await window.api.openFile()).toBeNull()
      expect(appNotice).toHaveBeenCalledWith('Error: File operation failed')
      expect(fileDialog).not.toHaveBeenCalled()
    }
  )

  it('uses the native multiple-file picker for combining PDFs', async () => {
    call.mockImplementation(async (command) =>
      command === 'pick_files_native' ? ['C:\\first.pdf', 'C:\\second.pdf'] : new ArrayBuffer(4)
    )
    const files = await window.api.pickPdfs()
    expect(files.map((file) => file.filePath)).toEqual(['C:\\first.pdf', 'C:\\second.pdf'])
    expect(call).toHaveBeenCalledWith('pick_files_native', {
      title: 'Choose PDF files',
      extensions: ['pdf'],
      multiple: true
    })
    expect(fileDialog).not.toHaveBeenCalled()
  })

  it('prevents repeated clicks from stacking native pickers and permits reopening afterward', async () => {
    let finish!: (paths: string[]) => void
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const first = nativeFileDialog({ title: 'Open PDF', extensions: ['pdf'] })
    expect(await nativeFileDialog({ title: 'Open PDF' })).toBeNull()
    expect(call).toHaveBeenCalledTimes(1)
    finish([])
    expect(await first).toBeNull()
    call.mockResolvedValue(['C:\\second.pdf'])
    expect(await nativeFileDialog({ title: 'Open PDF' })).toEqual(['C:\\second.pdf'])
  })

  it('releases the picker guard after an error', async () => {
    call.mockRejectedValueOnce(new Error('Native dialog unavailable'))
    await expect(nativeFileDialog({ title: 'Choose file' })).rejects.toThrow(
      'Native dialog unavailable'
    )
    call.mockResolvedValue([])
    expect(await nativeFileDialog({ title: 'Choose file' })).toBeNull()
    expect(call).toHaveBeenCalledTimes(2)
  })
})
