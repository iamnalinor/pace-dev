/** The Android package the App Links open. */
const PACKAGE = "dev.nalinor.pace";

/**
This site's `/app/login` App Link as an intent Chrome hands to the app; without the app it
falls back to the site (`origin`, e.g. `https://pace.nalinor.dev`).
*/
export const appIntent = (origin: string): string => {
  const { host } = new URL(origin);
  const fallback = encodeURIComponent(`${origin}/`);
  return `intent://${host}/app/login#Intent;scheme=https;package=${PACKAGE};S.browser_fallback_url=${fallback};end`;
};

/** An Android browser (Telegram's in-app one included): only there does the intent mean anything. */
export const isAndroidBrowser = (userAgent: string): boolean => /\bAndroid\b/u.test(userAgent);
