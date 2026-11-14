/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CMI_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv & { readonly DEV: boolean; readonly PROD: boolean };
}
