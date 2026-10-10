// Backport electron-builder a356198ec7c54c7795659342bff36d9a5162cd93
// to the locked v25 template. MIT notice: build/electron-builder-LICENSE.txt.
// Fixed-size reads of SHGetKnownFolderPath's shorter allocation can crash
// System.dll. Apply before compilation; defining nested NSIS macros is unsafe
// with the legacy compiler. Reject an unexpected template rather than guessing.
const fs = require('node:fs')
const path = require('node:path')
module.exports = async function prepareInstaller(context) {
  if (context.electronPlatformName !== 'win32') return
  const root = path.dirname(require.resolve('app-builder-lib/package.json'))
  const file = path.join(root, 'templates/nsis/multiUser.nsh')
  const original = fs.readFileSync(file, 'utf8')
  if (original.includes("KERNEL32::lstrcpynW(w .r0, p r2, i ${NSIS_MAX_STRLEN})p")) return
  const template = original.replace(/\r\n/g, '\n')
  const start = template.indexOf('      System::Store S\n')
  const end = template.indexOf('      System::Store L\n', start)
  if (start < 0 || end < 0 || !template.slice(start, end).includes("*$2(&w${NSIS_MAX_STRLEN} .s)")) {
    throw new Error('Unexpected NSIS per-user path template: review the upstream installer fix')
  }
  const replacement = [
    '      Push $1',
    '      Push $2',
    '      StrCpy $2 0',
    `      System::Call 'SHELL32::SHGetKnownFolderPath(g "\${FOLDERID_UserProgramFiles}", i \${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'`,
    '      ${If} $1 == 0',
    `        System::Call 'KERNEL32::lstrcpynW(w .r0, p r2, i \${NSIS_MAX_STRLEN})p'`,
    '      ${endif}',
    '      ${If} $2 != 0',
    `        System::Call 'OLE32::CoTaskMemFree(p r2)'`,
    '      ${endif}',
    '      Pop $2',
    '      Pop $1',
    ''
  ].join('\n')
  fs.writeFileSync(file, template.slice(0, start) + replacement + template.slice(end + '      System::Store L\n'.length))
  console.log('Applied upstream bounded NSIS per-user path copy')
}
