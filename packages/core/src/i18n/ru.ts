import type { en } from "./en.ts";

import { ruBoard } from "./ru/board.ts";
import { ruInput } from "./ru/input.ts";
import { ruLibrary } from "./ru/library.ts";
import { ruShell } from "./ru/shell.ts";

/** Russian: the same keys as `en`, area by area. */
export const ru: { readonly [K in keyof typeof en]: string } = {
  ...ruShell,
  ...ruBoard,
  ...ruInput,
  ...ruLibrary,
};
