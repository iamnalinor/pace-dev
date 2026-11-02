/** Nothing to stop: the app never listened. */
const stopNothing = (): void => undefined;

/**
Calls `listener` when the window comes back to the front without the tab having been hidden (a
click back into the browser window). The app has no such window: a return to the foreground is
AppState's "active". Answers the way to stop listening.
*/
export const onWindowFocus = (_listener: () => void): (() => void) => stopNothing;
