import { getRandomValues } from "expo-crypto";

type GetRandomValues = (array: Uint8Array) => Uint8Array;

/** The part of `globalThis` this needs: Hermes has no `crypto` at all. */
export type RandomScope = { crypto?: { getRandomValues?: GetRandomValues } };

/**
The `crypto` a runtime without `getRandomValues` should get, with `source` in it; `undefined`
when the runtime has its own. Hermes on Android has none, and ids (ulidx, through
`@pace/core`'s `newId`) cannot be made without it: the app closed at start.
*/
export const cryptoToInstall = (
  scope: RandomScope,
  source: GetRandomValues,
): RandomScope["crypto"] =>
  typeof scope.crypto?.getRandomValues === "function"
    ? undefined
    : { ...scope.crypto, getRandomValues: source };

// Installed when the root layout imports this, before anything makes an id.
const missing = cryptoToInstall(globalThis as RandomScope, (array) => getRandomValues(array));
if (missing !== undefined) {
  // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a polyfill: Hermes has no crypto, and @pace/core reads globalThis.crypto for ids
  (globalThis as RandomScope).crypto = missing;
}
