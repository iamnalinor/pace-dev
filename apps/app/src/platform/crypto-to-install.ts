type GetRandomValues = (array: Uint8Array) => Uint8Array;

/** The part of `globalThis` this needs: Hermes has no `crypto` at all. */
export type RandomScope = { crypto?: { getRandomValues?: GetRandomValues } };

/**
The `crypto` a runtime without `getRandomValues` should get, with `source` in it; `undefined`
when the runtime has its own. Hermes on Android has none, and ids (ulidx, through
`@pace/core`'s `newId`) cannot be made without it: the app closed at start. `random-values.ts`
installs it.
*/
export const cryptoToInstall = (
  scope: RandomScope,
  source: GetRandomValues,
): RandomScope["crypto"] =>
  typeof scope.crypto?.getRandomValues === "function"
    ? undefined
    : { ...scope.crypto, getRandomValues: source };
