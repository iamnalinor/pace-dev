import type { FunctionComponent } from "react";

import type { ThemeName } from "@pace/core";

export type DocumentThemeProps = {
  /** A scrim is up (a sheet is open): the status bar dims with the screen. */
  readonly isDimmed: boolean;
  readonly scheme: ThemeName;
};

/** Android has no page to colour: its status bar follows the app (the web build: `.web.tsx`). */
export const DocumentTheme: FunctionComponent<DocumentThemeProps> = () => null;
