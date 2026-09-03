/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_TOKEN_TRANSPORT?: 'BODY' | 'COOKIE';
  readonly VITE_DEV_BYPASS_PERMISSIONS?: 'true' | 'false';
  readonly VITE_DEV_PERMISSIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
