import type { ThemeName } from "./token-types.ts";

import { composite } from "./contrast.ts";
import { color } from "./tokens.ts";

/**
The colour of the page itself, as `#rrggbb` in lower case: the app ground (`bg.app`) of `theme`,
which the browser shows behind the app, in its status bar (`theme-color`) and on an overscroll.
`isDimmed` is that ground under the scrim a sheet draws, so the status bar dims with the screen
instead of staying bright above a dark backdrop. Pure: the web build writes both values into
`theme-boot.js` and `index.html`, and `DocumentTheme` reads them while the app runs.
*/
export const documentGround = (theme: ThemeName, isDimmed: boolean): string =>
  isDimmed
    ? composite(color(theme, "scrim"), color(theme, "bg.app"))
    : color(theme, "bg.app").toLowerCase();
