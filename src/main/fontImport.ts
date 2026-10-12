import { inflateSync } from 'node:zlib'

export async function normalizeImportedFont(bytes: Uint8Array): Promise<Uint8Array> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > 32 * 1024 * 1024)
    throw new Error('Invalid font file or font exceeds 32 MB')
  const signature = String.fromCharCode(...bytes.subarray(0, 4))
  if (signature === 'wOFF') {
    if (bytes.length < 44) throw new Error('Invalid WOFF header')
    const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      count = input.getUint16(12),
      reported = input.getUint32(16)
    if (count < 1 || count > 256 || reported > 32 * 1024 * 1024 || 44 + count * 20 > bytes.length)
      throw new Error('Invalid WOFF table directory')
    const tables: { tag: number; checksum: number; data: Uint8Array }[] = []
    let length = 12 + count * 16
    for (let i = 0; i < count; i++) {
      const at = 44 + i * 20,
        offset = input.getUint32(at + 4),
        compressed = input.getUint32(at + 8),
        original = input.getUint32(at + 12)
      if (
        compressed > original ||
        offset + compressed > bytes.length ||
        original > 32 * 1024 * 1024
      )
        throw new Error('Invalid WOFF table')
      const table = bytes.subarray(offset, offset + compressed),
        decoded =
          compressed < original
            ? new Uint8Array(inflateSync(table, { maxOutputLength: original }))
            : table
      if (decoded.length !== original) throw new Error('Invalid WOFF table length')
      length += Math.ceil(original / 4) * 4
      if (length > 32 * 1024 * 1024) throw new Error('WOFF decompressed font exceeds 32 MB')
      tables.push({ tag: input.getUint32(at), checksum: input.getUint32(at + 16), data: decoded })
    }
    if (length !== reported) throw new Error('Invalid WOFF decompressed size')
    const output = new Uint8Array(length),
      view = new DataView(output.buffer),
      power = 2 ** Math.floor(Math.log2(count))
    view.setUint32(0, input.getUint32(4))
    view.setUint16(4, count)
    view.setUint16(6, power * 16)
    view.setUint16(8, Math.log2(power))
    view.setUint16(10, count * 16 - power * 16)
    let offset = 12 + count * 16
    let headOffset: number | undefined
    tables.forEach((table, i) => {
      const at = 12 + i * 16
      view.setUint32(at, table.tag)
      view.setUint32(at + 4, table.checksum)
      view.setUint32(at + 8, offset)
      view.setUint32(at + 12, table.data.length)
      output.set(table.data, offset)
      if (table.tag === 0x68656164) {
        if (table.data.length < 12) throw new Error('Invalid font head table')
        headOffset = offset
        view.setUint32(offset + 8, 0)
      }
      offset += Math.ceil(table.data.length / 4) * 4
    })
    // A rebuilt SFNT directory can move tables. Its whole-font checksum must
    // describe these offsets, not the directory of the original WOFF source.
    if (headOffset !== undefined) {
      let checksum = 0
      for (let at = 0; at < length; at += 4) checksum = (checksum + view.getUint32(at)) >>> 0
      view.setUint32(headOffset + 8, (0xb1b0afba - checksum) >>> 0)
    }
    return output
  }
  if (signature !== 'wOF2') return bytes
  if (
    bytes.length < 48 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16) > 32 * 1024 * 1024
  )
    throw new Error('WOFF2 decompressed font exceeds 32 MB')
  // Fontkit's old WOFF2 subset writer can emit invalid glyph outlines. Google's
  // decoder reconstructs the SFNT tables before browser preview and embedding.
  const { default: decompress } = await import('wawoff2/decompress.js')
  return new Uint8Array(await decompress(bytes))
}
