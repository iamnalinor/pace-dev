/**
The stored theme preference, read synchronously: the same key `theme.ts` saves under and
`public/theme-boot.js` reads before the bundle. Without it the app's first frame would take the
OS scheme and flip to the chosen one a tick later, undoing what the boot script set.
*/
export const storedThemePreference = (): null | string => {
  try {
    return globalThis.localStorage.getItem("pace.theme");
  } catch {
    return null;
  }
};
