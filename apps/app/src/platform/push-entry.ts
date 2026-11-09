/**
A phone has no browser history to step through: a change inside a screen keeps the screen's one
place in the stack (Back leaves the screen, as Android expects). The web build takes a step
(`push-entry.web.ts`, QA round 24 R24-02).
*/
const noStep = (): void => undefined;

// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the web build's, which does call hooks
export const usePushEntry = (): (() => void) => noStep;

/** The tab navigator's Back on a phone: the library's default (to the first tab). */
export const TAB_BACK_BEHAVIOR = "firstRoute";
