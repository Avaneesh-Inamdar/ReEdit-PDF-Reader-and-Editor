import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const override = {
  bundle: { createUpdaterArtifacts: false, resources: { ...config.bundle.resources } }
}
if (process.platform === 'win32') {
  if (!process.env.REEDIT_CRT_DIR)
    throw Error('Set REEDIT_CRT_DIR to the matching MSVC redistributable directory')
  for (const name of readdirSync(process.env.REEDIT_CRT_DIR).filter((name) =>
    name.endsWith('.dll')
  ))
    override.bundle.resources[resolve(join(process.env.REEDIT_CRT_DIR, name))] = name
}
mkdirSync('release', { recursive: true })
writeFileSync('release/native-build-config.json', JSON.stringify(override, null, 2))
