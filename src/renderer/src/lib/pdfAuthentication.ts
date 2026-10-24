import { invoke, isTauri } from '@tauri-apps/api/core'
import { pdfPasswordDialog } from './pdfPasswordDialog'

const checked = new WeakSet<ArrayBuffer>()
const ownerMessage =
  'This PDF has restricted permissions. Enter its permissions (owner) password to open it for editing.'

export async function releasePdfAuthentication(
  authenticationId: string | null | undefined
): Promise<void> {
  if (authenticationId && isTauri()) await invoke('close_pdf_authentication', { authenticationId })
}

export async function authenticatePdf(
  data: ArrayBuffer,
  name: string,
  signal?: AbortSignal
): Promise<{ data: ArrayBuffer; authenticationId?: string; sourcePermissions?: number[] } | null> {
  if (signal?.aborted) return null
  if (!isTauri() || checked.has(data)) return { data }
  const security = await invoke<{
    encrypted: boolean
    passwordRequired: boolean
    permissions: number[]
  }>('pdf_security', new Uint8Array(data))
  if (signal?.aborted) return null
  if (!security.encrypted) {
    checked.add(data)
    return { data }
  }
  const authenticationId = crypto.randomUUID()
  let abandoned = false
  const unlock = async (
    password?: string
  ): Promise<{ data: ArrayBuffer; authenticationId: string; sourcePermissions: number[] }> => {
    try {
      const unlocked = await invoke<ArrayBuffer>('unlock_pdf', new Uint8Array(data), {
        headers: {
          'x-reedit-options': encodeURIComponent(JSON.stringify({ authenticationId, password }))
        }
      })
      if (signal?.aborted || abandoned) {
        await releasePdfAuthentication(authenticationId)
        throw new Error('Opening cancelled.')
      }
      checked.add(unlocked)
      return { data: unlocked, authenticationId, sourcePermissions: security.permissions }
    } catch (error) {
      const message = String(error)
      if (message.includes('PDF_OWNER_PASSWORD_REQUIRED')) throw new Error(ownerMessage)
      if (message.includes('PDF_PASSWORD_INCORRECT'))
        throw new Error('The password is incorrect. Try again.')
      throw new Error('Unable to unlock this PDF. Check the file and try again.')
    }
  }
  let message: string | undefined
  if (!security.passwordRequired) {
    try {
      return await unlock()
    } catch (error) {
      if (signal?.aborted) return null
      if (!(error instanceof Error) || error.message !== ownerMessage) throw error
      message = ownerMessage
    }
  }
  const result = await pdfPasswordDialog(name, unlock, signal, message)
  if (!result) {
    abandoned = true
    await releasePdfAuthentication(authenticationId)
  }
  return result
}
