/**
Calls `listener` when the browser window takes the focus back (a click back into it from another
window): the tab was never hidden, so AppState says nothing. Answers the way to stop listening.
*/
export const onWindowFocus = (listener: () => void): (() => void) => {
  globalThis.addEventListener("focus", listener);
  return () => {
    globalThis.removeEventListener("focus", listener);
  };
};
