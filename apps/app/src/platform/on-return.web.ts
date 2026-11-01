import { useReturns } from "./returns.ts";

/** Runs `onReturn` each time the tab is shown again or its window takes focus. */
export const useOnReturn = (onReturn: () => void): void => {
  useReturns(onReturn, { windowFocus: true });
};
