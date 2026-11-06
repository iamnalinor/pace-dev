/**
A phone's browser has no system Back the page can rely on, so the sheet shows its close cross at
every width (spec §4.2.21: "phone web had no visible way out").
*/
export const HAS_SHEET_CROSS = true;

/**
On the web the handle is a pointer's affordance only: the cross and Escape close the sheet for the
keyboard and the screen reader, and the handle is no extra stop.
*/
export const IS_HANDLE_ACCESSIBLE = false;
