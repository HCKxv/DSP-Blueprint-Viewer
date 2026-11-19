/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
  readonly VITE_ENABLE_EXTERNAL_LOAD?: string
  readonly VITE_SHOW_FOOTER?: string
  readonly VITE_SHOW_PWA_STATUS?: string
  readonly VITE_SHOW_VISITOR_STATS?: string
}
