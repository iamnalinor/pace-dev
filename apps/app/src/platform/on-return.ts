import { useReturns } from "./returns.ts";

/** Runs `onReturn` each time the app comes back to the foreground (the web build: `on-return.web.ts`). */
export const useOnReturn = (onReturn: () => void): void => {
  useReturns(onReturn, { windowFocus: false });
};
