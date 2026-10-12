import {
  mkdirSync,
  copyFileSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  existsSync
} from 'node:fs'
const packages = [
  'lato',
  'libre-baskerville',
  'noto-sans',
  'noto-serif',
  'open-sans',
  'roboto',
  'source-code-pro',
  'source-sans-3',
  'source-serif-4',
  'ubuntu'
]
const target = 'src/renderer/src/assets/fonts'
mkdirSync(target, { recursive: true })
let css = ''
for (const name of packages) {
  const directory = `node_modules/@fontsource/${name}`
  const metadata = JSON.parse(readFileSync(`${directory}/metadata.json`, 'utf8'))
  for (const file of readdirSync(`${directory}/files`).filter((file) =>
    /-latin-(400|700)-(normal|italic)\.woff$/.test(file)
  )) {
    copyFileSync(`${directory}/files/${file}`, `${target}/${file}`)
    const [, weight, style] = file.match(/-(400|700)-(normal|italic)\.woff$/)
    css += `@font-face{font-family:"${metadata.family}";font-style:${style};font-weight:${weight};font-display:swap;src:url("./${file}") format("woff")}\n`
  }
  // Full Adobe faces have their upstream copyright notice checked into source.
  if (!['source-sans-3', 'source-serif-4'].includes(name) && existsSync(`${directory}/LICENSE`))
    copyFileSync(`${directory}/LICENSE`, `${target}/${name}-LICENSE.txt`)
  for (const weight of [400, 700])
    for (const style of ['normal', 'italic']) {
      const full = `${name}-${weight}-${style}.otf`
      if (existsSync(`${target}/${full}`))
        css += `@font-face{font-family:"${metadata.family}";font-style:${style};font-weight:${weight};font-display:swap;src:url("./${full}") format("opentype")}\n`
    }
}
writeFileSync(`${target}/fonts.css`, css)
