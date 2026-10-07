// `vite/client` is loaded through tsconfig `types`; this file only names our variables.
interface ImportMetaEnv {
  /** API origin, e.g. `https://pace-api.nalinor.dev`; defaults to the local Worker. */
  readonly VITE_API_URL?: string;
  /** Telegram bot username without `@`. */
  readonly VITE_TELEGRAM_BOT?: string;
  /** `"1"` shows the dev login form in a production build (e2e). */
  readonly VITE_DEV_LOGIN?: string;
}
