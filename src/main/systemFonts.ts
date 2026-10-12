import { app } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SystemFont } from '../shared/fonts'

const files = new Map<string, string>()
let loading: Promise<SystemFont[]> | undefined
export function systemFonts(): Promise<SystemFont[]> {
  if (loading) return loading
  loading = (async () => {
    const paths = new Set<string>()
    if (process.platform === 'linux') {
      try {
        const result = await promisify(execFile)('fc-list', ['--format', '%{file}\n'], {
          maxBuffer: 4 * 1024 * 1024,
          timeout: 10000
        })
        result.stdout.split('\n').forEach((file) => paths.add(file.trim()))
      } catch {
        return []
      }
    } else {
      const directories =
        process.platform === 'win32'
          ? [
              join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
              join(process.env.LOCALAPPDATA || app.getPath('home'), 'Microsoft', 'Windows', 'Fonts')
            ]
          : ['/Library/Fonts', join(app.getPath('home'), 'Library', 'Fonts')]
      for (const directory of directories)
        try {
          for (const entry of await readdir(directory)) paths.add(join(directory, entry))
        } catch {}
    }
    const { default: fontkit } = await import('@pdf-lib/fontkit')
    const result: SystemFont[] = []
    for (const file of [...paths].filter((file) => /\.(ttf|otf)$/i.test(file))) {
      try {
        if ((await stat(file)).size > 32 * 1024 * 1024) continue
        const font = fontkit.create(new Uint8Array(await readFile(file)))
        const name = font.fullName || font.postscriptName || font.familyName
        if (!name || result.some((item) => item.name === name)) continue
        const id = String(result.length)
        files.set(id, file)
        result.push({
          id,
          name,
          family: font.familyName || name,
          bold: /bold|black|heavy|semibold/i.test(font.subfamilyName || name),
          italic: /italic|oblique/i.test(font.subfamilyName || name)
        })
      } catch {}
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  })()
  return loading
}
export async function readSystemFont(id: string): Promise<Uint8Array> {
  await systemFonts()
  const file = files.get(id)
  if (!file) throw new Error('Unknown system font')
  return new Uint8Array(await readFile(file))
}
