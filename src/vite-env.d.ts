/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PAYMENT_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
