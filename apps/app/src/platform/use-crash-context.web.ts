/** The web has no native crash catcher to tell (and no `Platform.constants`): nothing to do. */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the phone's, which does call hooks
export const useCrashContext = (_route: string): void => undefined;
