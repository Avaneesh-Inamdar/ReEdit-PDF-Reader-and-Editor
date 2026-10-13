import { readFileSync, readdirSync, mkdirSync, copyFileSync, cpSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const root = 'release/native-packages'
mkdirSync(root, { recursive: true })
function collect(folder, extension, suffix) {
  const files = readdirSync(folder).filter((name) => name.endsWith(extension))
  if (files.length !== 1) throw Error(`Expected one ${extension} package in ${folder}`)
  const target = join(root, `Re-Edit-PDF-${version}-${suffix}${extension}`)
  copyFileSync(join(folder, files[0]), target)
  return resolve(target)
}
if (process.platform === 'win32') {
  collect('target/release/bundle/nsis', '.exe', 'windows-x64-setup')
  collect('target/release/bundle/msi', '.msi', 'windows-x64')
  const portable = `release/portable/Re-Edit-PDF-${version}`
  mkdirSync(portable, { recursive: true })
  copyFileSync('target/release/Re-Edit-PDF.exe', join(portable, 'Re-Edit-PDF.exe'))
  for (const name of readdirSync(process.env.REEDIT_CRT_DIR).filter((name) =>
    name.endsWith('.dll')
  ))
    copyFileSync(join(process.env.REEDIT_CRT_DIR, name), join(portable, name))
  copyFileSync('build/document.ico', join(portable, 'document.ico'))
  cpSync('src/renderer/src/assets/fonts', join(portable, 'font-licenses'), {
    recursive: true,
    filter: (path) => !path.endsWith('.woff') && !path.endsWith('.otf') && !path.endsWith('.css')
  })
  for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) copyFileSync(name, join(portable, name))
  writeFileSync(
    join(portable, 'README.txt'),
    'Run Re-Edit-PDF.exe from this folder. Keep the DLLs alongside it. Requires Microsoft Edge WebView2 Runtime (normally present on Windows 10/11). Use the setup EXE to install missing WebView2 automatically.\n'
  )
} else {
  collect('target/release/bundle/deb', '.deb', 'linux-amd64')
  collect('target/release/bundle/rpm', '.rpm', 'linux-x86_64')
  const appimage = collect('target/release/bundle/appimage', '.AppImage', 'linux-x86_64')
  // The extracted AppDir retains bundled libraries and the launcher, unlike a
  // bare ELF binary mislabeled as a portable package. No FUSE mount is needed.
  mkdirSync('release/appimage-extract', { recursive: true })
  execFileSync('chmod', ['+x', appimage])
  execFileSync(appimage, ['--appimage-extract'], {
    cwd: 'release/appimage-extract',
    stdio: 'ignore'
  })
  execFileSync('tar', [
    '-czf',
    resolve(join(root, `Re-Edit-PDF-${version}-linux-x86_64.tar.gz`)),
    '-C',
    'release/appimage-extract',
    'squashfs-root'
  ])
}
const info = {
  version,
  platform: process.platform,
  architecture: process.arch,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
  signing:
    'Updater signatures are added locally after downloading CI artifacts. Windows publisher signing is not configured.'
}
writeFileSync(join(root, `build-info-${process.platform}.json`), JSON.stringify(info, null, 2))
