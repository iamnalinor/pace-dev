import type { HapticKind } from "./haptics.ts";

/** The web has no haptics (spec §3.10): the press feedback is the state layer alone. */
export const haptic = (_kind: HapticKind): void => undefined;
