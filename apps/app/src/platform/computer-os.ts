import type { ComputerOs } from "@pace/client";

/** The Android app runs on a phone: no computer to preselect (the web build reads the browser). */
export const browserComputerOs = (): ComputerOs | null => null;
