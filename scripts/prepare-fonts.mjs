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
  if (existsSync(`${directory}/LICENSE`))
    copyFileSync(`${directory}/LICENSE`, `${target}/${name}-LICENSE.txt`)
}
writeFileSync(`${target}/fonts.css`, css)
