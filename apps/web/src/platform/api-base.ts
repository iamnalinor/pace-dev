/** The API origin: `VITE_API_URL` at build time, the local `wrangler dev` port otherwise. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

/** Telegram bot username (without `@`) used by the Login Widget and the bot deep link. */
export const TELEGRAM_BOT: string = import.meta.env.VITE_TELEGRAM_BOT ?? "PaceTaskTrackerBot";

/** The dev login form is shown in `vite dev` and in builds made with `VITE_DEV_LOGIN=1` (e2e). */
export const IS_DEV_LOGIN_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEV_LOGIN === "1";
