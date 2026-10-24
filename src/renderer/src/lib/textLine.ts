import type { PdfTextRun } from './pdfText'

// Group only a connected line with compatible typography. Large gaps, columns,
// rotation and independent form/annotation text remain separate editing boxes.
export function connectedTextLine(run: PdfTextRun, runs: PdfTextRun[]): PdfTextRun[] {
  if (run.pdfAnnotationId || Math.abs(run.angle) > 0.01) return [run]
  const compatible = (item: PdfTextRun): boolean =>
    !item.pdfAnnotationId &&
    !!item.invisible === !!run.invisible &&
    Math.abs(item.size - run.size) < run.size * 0.1 &&
    item.fontFamily === run.fontFamily &&
    item.previewFont === run.previewFont &&
    item.color === run.color &&
    !!item.bold === !!run.bold &&
    !!item.italic === !!run.italic &&
    (item.characterSpacing || 0) === (run.characterSpacing || 0) &&
    (item.wordSpacing || 0) === (run.wordSpacing || 0) &&
    [0, 1, 2, 3].every(
      (index) =>
        Math.abs(
          (item.matrix?.[index] ?? [1, 0, 0, 1][index]) -
            (run.matrix?.[index] ?? [1, 0, 0, 1][index])
        ) < 0.01
    )
  const line = runs
    .filter(
      (item) =>
        item.key.split(':')[0] === run.key.split(':')[0] &&
        Math.abs(item.angle) < 0.01 &&
        Math.abs(item.y - run.y) < Math.max(item.size, run.size) * 0.35
    )
    .sort((a, b) => a.x - b.x)
  const index = line.findIndex((item) => item.key === run.key)
  if (index < 0) return [run]
  const gap = (a: PdfTextRun, b: PdfTextRun): number => b.x - a.x - a.width * (a.matrix?.[0] ?? 1)
  let first = index,
    last = index
  const joins = (a: PdfTextRun, b: PdfTextRun): boolean =>
    compatible(a) && compatible(b) && gap(a, b) >= -run.size * 0.2 && gap(a, b) < run.size * 1.5
  while (first > 0 && joins(line[first - 1], line[first])) first--
  while (last + 1 < line.length && joins(line[last], line[last + 1])) last++
  return line.slice(first, last + 1)
}
export function lineText(runs: PdfTextRun[]): string {
  return runs
    .map(
      (run, i) =>
        (i &&
        !/\s$/.test(runs[i - 1].text) &&
        !/^\s/.test(run.text) &&
        run.x - runs[i - 1].x - runs[i - 1].width * (runs[i - 1].matrix?.[0] ?? 1) > run.size * 0.15
          ? ' '
          : '') + run.text
    )
    .join('')
}
export function lineSource(runs: PdfTextRun[]): PdfTextRun {
  const first = runs[0],
    last = runs[runs.length - 1]
  return {
    ...first,
    text: lineText(runs),
    width: runs.length === 1 ? first.width : Math.max(first.width, last.x + last.width - first.x)
  }
}

function plainHorizontal(run: PdfTextRun): boolean {
  return (
    !run.pdfAnnotationId &&
    !run.vertical &&
    Math.abs(run.angle) < 0.01 &&
    (!run.matrix ||
      run.matrix.every((value, index) => Math.abs(value - [1, 0, 0, 1][index]) < 0.01))
  )
}

// PDF has no reliable paragraph boundaries. Limit inference to aligned, uniform
// body text. A short line ends a box; columns, mixed styles, transforms and large
// vertical gaps retain the existing line editor.
export function connectedTextBox(run: PdfTextRun, runs: PdfTextRun[]): PdfTextRun[][] {
  const selected = connectedTextLine(run, runs)
  if (!plainHorizontal(run)) return [selected]
  const seen = new Set<string>()
  const lines = runs
    .filter((item) => plainHorizontal(item) && item.key.split(':')[0] === run.key.split(':')[0])
    .flatMap((item) => {
      if (seen.has(item.key)) return []
      const line = connectedTextLine(item, runs)
      line.forEach((part) => seen.add(part.key))
      return [line]
    })
    .sort((a, b) => b[0].y - a[0].y || a[0].x - b[0].x)
  const index = lines.findIndex((line) => line.some((part) => part.key === run.key))
  if (index < 0) return [selected]
  const compatible = (line: PdfTextRun[]): boolean => {
    const first = line[0]
    const keys = new Set(line.map((part) => part.key))
    const right = Math.max(...line.map((part) => part.x + part.width))
    return (
      Math.abs(first.x - selected[0].x) < run.size * 0.3 &&
      first.size === run.size &&
      first.fontFamily === run.fontFamily &&
      first.previewFont === run.previewFont &&
      first.color === run.color &&
      !!first.bold === !!run.bold &&
      !!first.italic === !!run.italic &&
      !!first.invisible === !!run.invisible &&
      (first.characterSpacing || 0) === (run.characterSpacing || 0) &&
      (first.wordSpacing || 0) === (run.wordSpacing || 0) &&
      // Do not join a line fragment while leaving differently styled words behind.
      !runs.some(
        (part) =>
          !keys.has(part.key) &&
          Math.abs(part.y - first.y) < run.size * 0.35 &&
          part.x < right + run.size * 1.5 &&
          part.x + part.width > first.x - run.size * 1.5
      )
    )
  }
  if (!compatible(lines[index])) return [selected]
  const adjacent = (upper: PdfTextRun[], lower: PdfTextRun[]): boolean => {
    const distance = upper[0].y - lower[0].y
    const upperWidth = lineSource(upper).width,
      lowerWidth = lineSource(lower).width
    return (
      compatible(upper) &&
      compatible(lower) &&
      distance >= run.size * 1.05 &&
      distance <= run.size * 1.6 &&
      // A short terminal line followed by another aligned box is a boundary.
      upperWidth >= lowerWidth * 0.85
    )
  }
  // Only the nearest line in the same column may continue the paragraph.
  const column = lines.filter((line) => Math.abs(line[0].x - selected[0].x) < run.size * 0.3)
  let first = column.findIndex((line) => line.some((part) => part.key === run.key)),
    last = first
  while (first > 0 && adjacent(column[first - 1], column[first])) first--
  while (last + 1 < column.length && adjacent(column[last], column[last + 1])) last++
  const result = column.slice(first, last + 1)
  if (result.length > 2) {
    const lineHeight = result[0][0].y - result[1][0].y
    if (
      result
        .slice(1)
        .some(
          (line, index) => Math.abs(result[index][0].y - line[0].y - lineHeight) > run.size * 0.1
        )
    )
      return [selected]
  }
  return result
}

export function textBoxText(lines: PdfTextRun[][]): string {
  return lines.map(lineText).join(' ')
}

export function textBoxSource(lines: PdfTextRun[][]): PdfTextRun {
  const source = lineSource(lines[0])
  if (lines.length < 2) return source
  const width = Math.max(...lines.map((line) => lineSource(line).width))
  return {
    ...source,
    text: textBoxText(lines),
    width,
    textBox: { width, lineHeight: lines[0][0].y - lines[1][0].y }
  }
}
