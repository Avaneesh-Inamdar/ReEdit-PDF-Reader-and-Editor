/// <reference types="vite/client" />

interface ImportMetaEnv {}

declare module '*.mjs?url' {
  const src: string
  export default src
}
