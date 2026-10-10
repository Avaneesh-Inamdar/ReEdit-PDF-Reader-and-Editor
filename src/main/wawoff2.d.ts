declare module 'wawoff2/decompress.js' {
  export default function decompress(bytes: Uint8Array): Promise<Uint8Array>
}
