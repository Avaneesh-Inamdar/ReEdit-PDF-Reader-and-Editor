export function fontIdentity(name: string): string {
  return name
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/(?:[- ,]*(?:semibold|bold|italic|oblique|regular|roman|medium|psmt|mt))+$/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}
export function matchingSystemFonts<
  T extends { name: string; family: string; bold: boolean; italic: boolean }
>(fonts: T[], family: string, bold = false, italic = false): T[] {
  const key = fontIdentity(family)
  return fonts
    .filter((font) => fontIdentity(font.family) === key || fontIdentity(font.name) === key)
    .sort(
      (a, b) =>
        Number(b.bold === bold) +
        Number(b.italic === italic) -
        Number(a.bold === bold) -
        Number(a.italic === italic)
    )
}
