// Suggested open-source replacements; stylistic alternatives are not exact
// copies. Preserve the embedded original unless the user chooses a replacement.
export const fontAlternatives = [
  { family: 'Arimo', replaces: 'Arial', match: /^(arial|helvetica)(?!.*narrow)/i },
  { family: 'Tinos', replaces: 'Times New Roman', match: /^(times)/i },
  { family: 'Cousine', replaces: 'Courier New', match: /^courier/i },
  { family: 'Carlito', replaces: 'Calibri', match: /^calibri/i },
  { family: 'Caladea', replaces: 'Cambria', match: /^cambria/i },
  { family: 'Roboto Condensed', replaces: 'Arial Narrow', match: /^(arial|helvetica).*narrow/i },
  { family: 'Montserrat', replaces: 'Gotham', match: /^gotham/i },
  { family: 'Source Sans 3', replaces: 'Myriad Pro', match: /^myriad/i },
  { family: 'Source Serif 4', replaces: 'Minion Pro', match: /^minion/i },
  { family: 'Source Code Pro', replaces: 'Consolas', match: /^consolas/i }
] as const

export function alternativeFontLabel(family: string): string {
  const entry = fontAlternatives.find((font) => font.family === family)
  return entry ? `${family} · alternative to ${entry.replaces}` : family
}

export function suggestedFont(family: string): string | undefined {
  return fontAlternatives.find((font) => font.match.test(family.replace(/^[A-Z]{6}\+/, '')))?.family
}
