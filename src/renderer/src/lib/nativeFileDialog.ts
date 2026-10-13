import { invoke } from '@tauri-apps/api/core'

interface OpenOptions {
  title: string
  extensions?: string[]
  multiple?: boolean
}

let opening = false

// All Open actions use the OS picker. Cancellation and errors must never
// launch a different picker, and repeated clicks must not stack dialogs.
export async function nativeFileDialog(options: OpenOptions): Promise<string[] | null> {
  if (opening) return null
  opening = true
  try {
    const paths = await invoke<string[]>('pick_files_native', {
      title: options.title,
      extensions: options.extensions || [],
      multiple: options.multiple || false
    })
    return paths.length ? paths : null
  } finally {
    opening = false
  }
}
