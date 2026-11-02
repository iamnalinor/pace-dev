import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Returns closer together than this are one return (a tab shown and focused at once). */
const SAME_RETURN_MS = 1000;

/**
Runs `onReturn` each time the app comes back to the foreground (a phone app, or a browser tab
shown again) and, with `windowFocus`, each time the window takes focus (a browser window brought
in front of another one, the tab visible all along).
*/
export const useReturns = (
  onReturn: () => void,
  { windowFocus }: { readonly windowFocus: boolean },
): void => {
  const latestRef = useRef(onReturn);
  useEffect(() => {
    latestRef.current = onReturn;
  });
  useEffect(() => {
    const last = { at: -Infinity };
    const returned = (): void => {
      const now = Date.now();
      if (now - last.at < SAME_RETURN_MS) {
        return;
      }
      last.at = now;
      latestRef.current();
    };
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        returned();
      }
    });
    if (windowFocus) {
      globalThis.addEventListener("focus", returned);
    }
    return () => {
      subscription.remove();
      if (windowFocus) {
        globalThis.removeEventListener("focus", returned);
      }
    };
  }, [windowFocus]);
};
