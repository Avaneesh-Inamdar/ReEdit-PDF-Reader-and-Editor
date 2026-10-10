export async function normalizeImportedFont(bytes: Uint8Array): Promise<Uint8Array> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > 32 * 1024 * 1024)
    throw new Error('Invalid font file or font exceeds 32 MB')
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2') return bytes
  if (bytes.length < 48 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16) > 32 * 1024 * 1024)
    throw new Error('WOFF2 decompressed font exceeds 32 MB')
  // Fontkit's old WOFF2 subset writer can emit invalid glyph outlines. Google's
  // decoder reconstructs the SFNT tables before browser preview and embedding.
  const { default: decompress } = await import('wawoff2/decompress.js')
  return new Uint8Array(await decompress(bytes))
}
