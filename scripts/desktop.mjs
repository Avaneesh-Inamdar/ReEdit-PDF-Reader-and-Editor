import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const [action = 'dev', ...args] = process.argv.slice(2)
if (!['dev', 'build'].includes(action)) throw new Error('Choose dev or build')
const root = fileURLToPath(new URL('../', import.meta.url))
const child =
  process.platform === 'win32'
    ? spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          fileURLToPath(new URL('./desktop.ps1', import.meta.url)),
          '-Action',
          action,
          ...args
        ],
        { cwd: root, stdio: 'inherit' }
      )
    : spawn(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), action, ...args], {
        cwd: root,
        stdio: 'inherit'
      })
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
