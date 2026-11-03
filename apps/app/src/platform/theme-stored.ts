/**
The theme preference as the first render can know it, without waiting: nothing on Android (its
store is async, and the first frame is system-coloured until it answers). The web build reads
localStorage (`theme-stored.web.ts`), so the first frame already has the theme the page was booted with.
*/
export const storedThemePreference = (): null | string => null;
