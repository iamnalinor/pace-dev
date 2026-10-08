import { enBoard } from "./en/board.ts";
import { enInput } from "./en/input.ts";
import { enLibrary } from "./en/library.ts";
import { enShell } from "./en/shell.ts";
import { enTime } from "./en/time.ts";

/** Source catalog: the keys here define `MessageKey`; every other language mirrors them. */
export const en = {
  ...enShell,
  ...enBoard,
  ...enInput,
  ...enLibrary,
  ...enTime,
} as const;
