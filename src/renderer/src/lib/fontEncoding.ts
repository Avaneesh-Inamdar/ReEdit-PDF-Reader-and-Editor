export function mapPdfGlyphs(
  text: string,
  encoding: Record<string, string> = {},
  preserveSpaces = false
): string {
  const sequences = Object.keys(encoding)
    .filter((value) => value.length > 1)
    .sort((a, b) => b.length - a.length)
  let result = ''
  for (let index = 0; index < text.length;) {
    const sequence = sequences.find((value) => text.startsWith(value, index))
    const character = sequence || String.fromCodePoint(text.codePointAt(index)!)
    result += preserveSpaces && /\s/.test(character) ? character : encoding[character] || character
    index += character.length
  }
  return result
}
