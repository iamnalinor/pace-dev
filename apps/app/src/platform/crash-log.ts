import type { Language } from "@pace/core";

import { paceNative } from "../../modules/pace-native/index.ts";

/** Where a report came from; native crashes are logged as "android" by `CrashLog.kt`. */
export type CrashKind = "js-error" | "js-fatal" | "promise" | "render";

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

/** The React Native and Hermes globals the crash log hooks into (absent on the web). */
export type CrashGlobals = {
  readonly ErrorUtils?: {
    readonly getGlobalHandler: () => ErrorHandler;
    readonly setGlobalHandler: (handler: ErrorHandler) => void;
  };
  readonly HermesInternal?: {
    readonly enablePromiseRejectionTracker: (options: {
      readonly allRejections: boolean;
      readonly onUnhandled: (id: number, rejection: unknown) => void;
    }) => void;
  };
};

const printable = (value: unknown): string => {
  try {
    // JSON has nothing to say about these (stringify returns undefined).
    return value === undefined || typeof value === "function" || typeof value === "symbol"
      ? String(value)
      : JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** "TypeError: message" and the stack, as one text (Hermes' stack already starts with the first line). */
export const describeError = (error: unknown, componentStack?: string): string => {
  let text = `Non-error thrown: ${printable(error)}`;
  if (error instanceof Error) {
    const head = `${error.name}: ${error.message}`;
    const stack = error.stack ?? "";
    text = stack.startsWith(head) ? stack : `${head}\n${stack}`.trimEnd();
  }
  return componentStack === undefined ? text : `${text}\n\nComponent stack:${componentStack}`;
};

/** Appends a report to the native crash log; logging never throws. */
export const recordCrash = (kind: CrashKind, error: unknown, componentStack?: string): void => {
  try {
    paceNative.appendCrashReport(kind, describeError(error, componentStack));
  } catch {
    // The log is best effort: a failing write must not replace the original error.
  }
};

/**
Logs every uncaught JS error before React Native handles it as usual (a fatal one still
closes the app), and, in release builds, every promise rejection nobody handled: those do
not crash, they leave the app half-started without a trace. Development keeps React
Native's own rejection warnings.
*/
export const installCrashLog = (
  globals: CrashGlobals = globalThis as CrashGlobals,
  isDev: boolean = __DEV__,
): void => {
  const { ErrorUtils, HermesInternal } = globals;
  if (ErrorUtils !== undefined) {
    const previous = ErrorUtils.getGlobalHandler();
    // eslint-disable-next-line promise/prefer-await-to-callbacks -- ErrorUtils only takes a callback
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      recordCrash(isFatal === true ? "js-fatal" : "js-error", error);
      previous(error, isFatal);
    });
  }
  if (!isDev) {
    HermesInternal?.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id, rejection) => {
        recordCrash("promise", rejection);
      },
    });
  }
};

/** The app language for screens shown before (or without) the account's settings. */
export const languageOfLocale = (locale: string): Language =>
  locale.toLowerCase().startsWith("ru") ? "ru" : "en";

export const deviceLanguage = (): Language =>
  languageOfLocale(new Intl.DateTimeFormat().resolvedOptions().locale);
