import Constants from "expo-constants";

const extra: Readonly<Record<string, unknown>> = Constants.expoConfig?.extra ?? {};

const extraString = (name: string, fallback: string): string => {
  const value = extra[name];
  return typeof value === "string" && value !== "" ? value : fallback;
};

/** The Worker the app talks to (`extra.apiUrl` in `app.config.ts`, from `EXPO_PUBLIC_API_URL`). */
export const API_BASE_URL = extraString("apiUrl", "https://pace-api.nalinor.dev");

/** The web app, used for the browser login fallback (`extra.webOrigin`). */
export const WEB_ORIGIN = extraString("webOrigin", "https://pace.nalinor.dev");

/** The Telegram bot of the web login widget (`extra.botUsername`). */
export const TELEGRAM_BOT = extraString("botUsername", "PaceTaskTrackerBot");

/** Dev builds and e2e builds (`extra.isDevLogin`) show the dev login form. */
export const IS_DEV_LOGIN_ENABLED: boolean = __DEV__ || extra["isDevLogin"] === true;
