import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

export function validatedFeed(release, manifest, current = null) {
  if (release.draft) throw Error('Do not advertise a draft release')
  const version = release.tag_name?.replace(/^v/, '')
  if (!semver.valid(version) || version !== manifest.version)
    throw Error('Release version mismatch')
  if (semver.major(version) < 2) return null
  if (current && semver.valid(current.version) && semver.lt(version, current.version)) return null
  // Once promoted, keep this channel stable. The original feed URL is retained
  // for alpha.2 clients, but later experimental tags must not replace it.
  if (current && semver.valid(current.version) && !semver.prerelease(current.version) &&
      (release.prerelease || semver.prerelease(version))) return null
  const assets = new Map(release.assets.map((asset) => [asset.browser_download_url, asset.name]))
  const verify = (entry) => {
    if (!entry || typeof entry.url !== 'string' || !assets.has(entry.url))
      throw Error('Unknown release asset')
    const signature = Buffer.from(entry.signature || '', 'base64')
      .toString('utf8')
      .replace(/\\t/g, '\t')
    const comment = signature.split('\n').find((line) => line.startsWith('trusted comment:'))
    const bound = comment
      ?.split('\t')
      .find((part) => part.startsWith('version:'))
      ?.slice(8)
      .trim()
    if (!signature.startsWith('untrusted comment:') || bound !== version)
      throw Error('Missing version-bound signature')
  }
  if (!manifest.platforms || !Object.keys(manifest.platforms).length)
    throw Error('No update platforms')
  Object.values(manifest.platforms).forEach(verify)
  for (const [name, entry] of Object.entries(manifest.downloads || {})) {
    verify(entry)
    if (assets.get(entry.url) !== name || !/^[a-f0-9]{64}$/.test(entry.sha256))
      throw Error('Invalid download metadata')
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [releasePath, manifestPath, outputPath] = process.argv.slice(2)
  const result = validatedFeed(
    JSON.parse(readFileSync(releasePath, 'utf8')),
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')) : null
  )
  if (result) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
    console.log('Prepared native update feed', result.version)
  } else console.log('Kept the newer native update feed')
}
