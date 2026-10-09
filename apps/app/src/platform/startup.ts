import { installCrashLog } from "./crash-log.ts";
import { installPolyfills } from "./polyfills.ts";

// The entry (`entry.ts`) imports this before expo-router: the built-ins Hermes lacks are
// filled in and the crash log listens before any route module loads.

installPolyfills();

installCrashLog();
