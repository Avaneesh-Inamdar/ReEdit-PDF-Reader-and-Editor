export function isNewerRelease(current: string, latest: string): boolean {
  const parse = (value: string): number[] | null => /^v?\d+\.\d+\.\d+$/.test(value) ? value.replace(/^v/,'').split('.').map(Number) : null
  const a=parse(current), b=parse(latest)
  if (!a || !b) return false
  for(let i=0;i<3;i++) { if (b[i] !== a[i]) return b[i]>a[i] }
  return false
}
export const releasesUrl='https://github.com/Avaneesh-Inamdar/Readit-Pdf-Reader-and-Editor/releases'
