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
