/**
Whether a phone's sheet shows a close cross: not on Android, where the handle, a tap on the dim and
the system Back close it (spec §4.2.21; PRODUCT principle 2). The web build swaps in
`overlay-platform.web.ts`.
*/
export const HAS_SHEET_CROSS = false;

/**
Whether the sheet's handle is an element of its own for assistive tech, with its actions (dismiss):
TalkBack's way to the drag.
*/
export const IS_HANDLE_ACCESSIBLE = true;
