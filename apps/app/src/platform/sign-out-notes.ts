import type { SignOutNotes } from "@pace/client";

/** The app is one process: no other tab to leave word for (the web build has its own). */
export const createSignOutNotes = (): SignOutNotes | undefined => undefined;
