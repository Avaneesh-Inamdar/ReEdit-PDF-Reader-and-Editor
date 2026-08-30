// WHY: split/extract pages via human range string (e.g. "1-3,5,7-9")
export function parsePageRange(range: string, totalPages: number): number[] {
  if (!range.trim()) throw new Error('empty range')
  const indices: number[] = []
  const parts = range.split(',').map(s=> s.trim()).filter(Boolean)
  for (const p of parts) {
    if (p.includes('-')) {
      const [aStr, bStr] = p.split('-').map(s=> s.trim())
      const a = parseInt(aStr, 10), b = parseInt(bStr, 10)
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > totalPages || b > totalPages) throw new Error(`invalid range segment "${p}"`)
      if (a > b) throw new Error(`range start > end in "${p}"`)
      for (let i=a;i<=b;i++) indices.push(i-1)
    } else {
      const n = parseInt(p, 10)
      if (!Number.isInteger(n) || n < 1 || n > totalPages) throw new Error(`invalid page "${p}"`)
      indices.push(n-1)
    }
  }
  // dedupe preserve order
  return [...new Set(indices)]
}

export function formatPageRange(indices: number[]): string {
  if (!indices.length) return ''
  const sorted = [...new Set(indices)].sort((a,b)=>a-b)
  const out: string[] = []
  let start = sorted[0], prev = sorted[0]
  for (let i=1;i<sorted.length;i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
    } else {
      out.push(start === prev ? `${start+1}` : `${start+1}-${prev+1}`)
      start = cur; prev = cur
    }
  }
  out.push(start === prev ? `${start+1}` : `${start+1}-${prev+1}`)
  return out.join(',')
}
