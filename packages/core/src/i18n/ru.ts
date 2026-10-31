import type { en } from "./en.ts";

import { ruBoard } from "./ru/board.ts";
import { ruDecisions } from "./ru/decisions.ts";
import { ruDevices } from "./ru/devices.ts";
import { ruInput } from "./ru/input.ts";
import { ruLibrary } from "./ru/library.ts";
import { ruNotify } from "./ru/notify.ts";
import { ruShell } from "./ru/shell.ts";
import { ruTime } from "./ru/time.ts";

/** Russian: the same keys as `en`, area by area. */
export const ru: { readonly [K in keyof typeof en]: string } = {
  ...ruShell,
  ...ruDevices,
  ...ruBoard,
  ...ruInput,
  ...ruLibrary,
  ...ruTime,
  ...ruNotify,
  ...ruDecisions,
};
