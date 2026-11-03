/*
Installs `crypto.getRandomValues` where the runtime has none (Hermes), when `entry.ts` imports
`polyfills.ts` (which imports this) before expo-router loads, so before anything makes an id. A module with no exports: the install
is all it is for; what to install is `cryptoToInstall`, tested on its own.
*/
import { getRandomValues } from "expo-crypto";

import { cryptoToInstall, type RandomScope } from "./crypto-to-install.ts";

const missing = cryptoToInstall(globalThis as RandomScope, (array) => getRandomValues(array));
if (missing !== undefined) {
  // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a polyfill: Hermes has no crypto, and @pace/core reads globalThis.crypto for ids
  (globalThis as RandomScope).crypto = missing;
}
