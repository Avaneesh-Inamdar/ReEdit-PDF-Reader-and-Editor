import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { pdfPasswordDialog } from '../src/renderer/src/lib/pdfPasswordDialog'
import { authenticatePdf } from '../src/renderer/src/lib/pdfAuthentication'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }))
vi.mock('../src/renderer/src/lib/pdfPasswordDialog', () => ({ pdfPasswordDialog: vi.fn() }))
const call = vi.mocked(invoke)
const prompt = vi.mocked(pdfPasswordDialog)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
})

describe('protected PDF authentication', () => {
  it('keeps ordinary PDFs unchanged and skips subsequent probes of the same working copy', async () => {
    const data = new ArrayBuffer(8)
    call.mockResolvedValue({ encrypted: false, passwordRequired: false })
    expect(await authenticatePdf(data, 'ordinary.pdf')).toEqual({ data })
    expect(await authenticatePdf(data, 'ordinary.pdf')).toEqual({ data })
    expect(call).toHaveBeenCalledTimes(1)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('retries an incorrect password and returns only working bytes plus an opaque session ID', async () => {
    const data = new ArrayBuffer(8),
      working = new ArrayBuffer(12)
    call.mockImplementation(async (command, _bytes, options) => {
      if (command === 'pdf_security') return { encrypted: true, passwordRequired: true }
      const { password } = JSON.parse(decodeURIComponent(options!.headers!['x-reedit-options']))
      if (password === 'wrong') throw new Error('PDF_PASSWORD_INCORRECT')
      return working
    })
    prompt.mockImplementation(async (_name, verify) => {
      await expect(verify('wrong')).rejects.toThrow('The password is incorrect. Try again.')
      return verify('right')
    })
    const result = await authenticatePdf(data, 'protected.pdf')
    expect(result?.data).toBe(working)
    expect(result?.authenticationId).toMatch(/^[a-f0-9-]+$/)
    expect(Object.keys(result!)).toEqual(['data', 'authenticationId', 'sourcePermissions'])
    expect(await authenticatePdf(working, 'protected.pdf')).toEqual({ data: working })
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('explains owner permissions instead of treating a valid restricted password as incorrect', async () => {
    const data = new ArrayBuffer(8),
      working = new ArrayBuffer(12)
    call.mockImplementation(async (command, _bytes, options) => {
      if (command === 'pdf_security') return { encrypted: true, passwordRequired: false }
      const { password } = JSON.parse(decodeURIComponent(options!.headers!['x-reedit-options']))
      if (!password) throw new Error('PDF_OWNER_PASSWORD_REQUIRED')
      return working
    })
    prompt.mockImplementation(async (_name, verify, _signal, message) => {
      expect(message).toContain('permissions (owner) password')
      return verify('owner')
    })
    expect((await authenticatePdf(data, 'restricted.pdf'))?.data).toBe(working)
  })

  it('cancels without unlocking and releases its unused authentication ID', async () => {
    call.mockResolvedValue({ encrypted: true, passwordRequired: true })
    prompt.mockResolvedValue(null)
    expect(await authenticatePdf(new ArrayBuffer(8), 'protected.pdf')).toBeNull()
    expect(call.mock.calls.map(([command]) => command)).toEqual([
      'pdf_security',
      'close_pdf_authentication'
    ])
  })

  it('releases a native unlock that completes after the dialog was cancelled', async () => {
    let finish!: (data: ArrayBuffer) => void
    let attempt!: Promise<unknown>
    call.mockImplementation(async (command) => {
      if (command === 'pdf_security') return { encrypted: true, passwordRequired: true }
      if (command === 'unlock_pdf')
        return new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        })
    })
    prompt.mockImplementation(async (_name, verify) => {
      attempt = verify('right')
      return null
    })
    expect(await authenticatePdf(new ArrayBuffer(8), 'protected.pdf')).toBeNull()
    finish(new ArrayBuffer(12))
    await expect(attempt).rejects.toThrow()
    expect(
      call.mock.calls.filter(([command]) => command === 'close_pdf_authentication')
    ).toHaveLength(2)
  })

  it('releases a native unlock after its document load is aborted', async () => {
    const controller = new AbortController()
    call.mockImplementation(async (command) => {
      if (command === 'pdf_security') return { encrypted: true, passwordRequired: true }
      if (command === 'unlock_pdf') {
        controller.abort()
        return new ArrayBuffer(12)
      }
    })
    prompt.mockImplementation(async (_name, verify) => {
      await expect(verify('right')).rejects.toThrow()
      return null
    })
    expect(await authenticatePdf(new ArrayBuffer(8), 'protected.pdf', controller.signal)).toBeNull()
    expect(
      call.mock.calls.filter(([command]) => command === 'close_pdf_authentication')
    ).toHaveLength(2)
  })
})
