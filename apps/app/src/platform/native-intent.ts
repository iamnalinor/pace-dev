/** The https host whose `/app/*` links open in the app (App Links, `assetlinks.json`). */
export const APP_LINK_PREFIX = "https://pace.nalinor.dev/app";

/** expo-share-intent hands shared content over as `<scheme>://dataUrl=...`. */
const SHARE_INTENT = /^[a-z][a-z0-9+.-]*:\/\/dataUrl=/i;

/**
 * Rewrites a system path into an in-app route: App Links drop the `/app` prefix, share
 * intents land on the Add screen, everything else (including `pace://` links) passes through.
 */
export const mapSystemPath = (path: string): string => {
  if (SHARE_INTENT.test(path)) {
    return "/add";
  }
  if (path === APP_LINK_PREFIX || path.startsWith(`${APP_LINK_PREFIX}/`)) {
    const rest = path.slice(APP_LINK_PREFIX.length);
    return rest === "" || rest === "/" ? "/" : rest;
  }
  return path;
};
