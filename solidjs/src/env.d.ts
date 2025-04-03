/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAT_HOST: string
  // Add other env variables here if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 