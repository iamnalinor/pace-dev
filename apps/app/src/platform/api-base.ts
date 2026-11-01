import Constants from "expo-constants";

const extra: Readonly<Record<string, unknown>> = Constants.expoConfig?.extra ?? {};

const extraString = (name: string, fallback: string): string => {
  const value = extra[name];
  return typeof value === "string" && value !== "" ? value : fallback;
};

/*
The build's defaults: the server this build was made for. The app talks to the server the person
chose (`readServer` in `server.ts`) and shows that server's own values (`useServerInfo`); only
those modules read these.
*/

/** The build's Worker (`extra.apiUrl` in `app.config.ts`, from `EXPO_PUBLIC_API_URL`). */
export const API_BASE_URL = extraString("apiUrl", "https://pace-api.nalinor.dev");

/** The build's server's web app (`extra.webOrigin`), until that server says its own. */
export const WEB_ORIGIN = extraString("webOrigin", "https://pace.nalinor.dev");

/** The build's server's bot for the web login widget (`extra.botUsername`), until it says its own. */
export const TELEGRAM_BOT = extraString("botUsername", "PaceTaskTrackerBot");

/** Dev builds and e2e builds (`extra.isDevLogin`) show the dev login form. */
export const IS_DEV_LOGIN_ENABLED: boolean = __DEV__ || extra["isDevLogin"] === true;
