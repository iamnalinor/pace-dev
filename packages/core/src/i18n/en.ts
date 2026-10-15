import { enBoard } from "./en/board.ts";
import { enDevices } from "./en/devices.ts";
import { enInput } from "./en/input.ts";
import { enLibrary } from "./en/library.ts";
import { enNotify } from "./en/notify.ts";
import { enShell } from "./en/shell.ts";
import { enTime } from "./en/time.ts";

/** Source catalog: the keys here define `MessageKey`; every other language mirrors them. */
export const en = {
  ...enShell,
  ...enDevices,
  ...enBoard,
  ...enInput,
  ...enLibrary,
  ...enTime,
  ...enNotify,
} as const;
