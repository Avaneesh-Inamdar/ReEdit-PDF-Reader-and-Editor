import type { PdfTextRun } from './pdfText'

// Group only a connected line with compatible typography. Large gaps, columns,
// rotation and independent form/annotation text remain separate editing boxes.
export function connectedTextLine(run: PdfTextRun, runs: PdfTextRun[]): PdfTextRun[] {
  if (run.pdfAnnotationId || Math.abs(run.angle) > 0.01) return [run]
  const line = runs
    .filter(
      (item) =>
        !item.pdfAnnotationId &&
        !!item.invisible === !!run.invisible &&
        Math.abs(item.angle) < 0.01 &&
        Math.abs(item.y - run.y) < Math.max(item.size, run.size) * 0.35 &&
        Math.abs(item.size - run.size) < run.size * 0.1 &&
        item.fontFamily === run.fontFamily &&
        item.previewFont === run.previewFont &&
        item.color === run.color &&
        !!item.bold === !!run.bold &&
        !!item.italic === !!run.italic
    )
    .sort((a, b) => a.x - b.x)
  const index = line.findIndex((item) => item.key === run.key)
  if (index < 0) return [run]
  const gap = (a: PdfTextRun, b: PdfTextRun): number => b.x - a.x - a.width * (a.matrix?.[0] ?? 1)
  let first = index,
    last = index
  while (first > 0 && gap(line[first - 1], line[first]) < run.size * 1.5) first--
  while (last + 1 < line.length && gap(line[last], line[last + 1]) < run.size * 1.5) last++
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
