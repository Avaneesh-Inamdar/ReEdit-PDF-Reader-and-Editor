import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { releasePdfAuthentication } from '../src/renderer/src/lib/pdfAuthentication'
import { usePdfStore } from '../src/renderer/src/stores/usePdfStore'
import { useTabStore } from '../src/renderer/src/stores/useTabStore'
import { restoreSession } from '../src/renderer/src/lib/documentSession'
import { saveDocument } from '../src/renderer/src/lib/documentActions'

vi.mock('../src/renderer/src/lib/pdfAuthentication', () => ({
  releasePdfAuthentication: vi.fn().mockResolvedValue(undefined)
}))

let source: ArrayBuffer
const api = { saveFile: vi.fn(), saveFileAs: vi.fn() }
beforeEach(async () => {
  restoreSession()
  useTabStore.setState({ tabs: [], activeTabId: null })
  vi.clearAllMocks()
  vi.stubGlobal('window', { api })
  vi.stubGlobal('alert', vi.fn())
  api.saveFile.mockResolvedValue('C:\\first.pdf')
  api.saveFileAs.mockResolvedValue('C:\\copy.pdf')
  const document = await PDFDocument.create()
  document.addPage()
  source = (await document.save()).slice().buffer as ArrayBuffer
})

describe('protected document sessions', () => {
  it('keeps authentication and source permissions isolated per tab and releases each closed tab', () => {
    const first = useTabStore.getState().openTab('C:\\first.pdf', source)
    usePdfStore.setState({ authenticationId: 'first-session', sourcePermissions: [4, 8] })
    const second = useTabStore.getState().openTab('C:\\second.pdf', source.slice(0))
    expect(usePdfStore.getState().authenticationId).toBeNull()
    usePdfStore.setState({ authenticationId: 'second-session', sourcePermissions: [4] })
    useTabStore.getState().setActiveTab(first)
    expect(usePdfStore.getState().authenticationId).toBe('first-session')
    expect(usePdfStore.getState().sourcePermissions).toEqual([4, 8])
    useTabStore.getState().closeTab(second)
    expect(releasePdfAuthentication).toHaveBeenLastCalledWith('second-session')
    expect(usePdfStore.getState().authenticationId).toBe('first-session')
    useTabStore.getState().closeTab(first)
    expect(releasePdfAuthentication).toHaveBeenLastCalledWith('first-session')
    expect(usePdfStore.getState().authenticationId).toBeNull()
  })

  it('passes only the opaque session ID to Save, Save As and flattened PDF exports', async () => {
    useTabStore.getState().openTab('C:\\first.pdf', source)
    usePdfStore.setState({ authenticationId: 'protected-session' })
    expect(await saveDocument()).toBe(true)
    expect(api.saveFile.mock.calls[0].slice(1)).toEqual([
      'first.pdf',
      'C:\\first.pdf',
      'protected-session'
    ])
    expect(await saveDocument(true)).toBe(true)
    expect(api.saveFileAs.mock.calls[0].slice(1)).toEqual(['first.pdf', 'protected-session'])
    expect(await saveDocument(true, true)).toBe(true)
    expect(api.saveFileAs.mock.calls[1].slice(1)).toEqual(['copy-flat.pdf', 'protected-session'])
    expect(usePdfStore.getState().authenticationId).toBe('protected-session')
  })
})
