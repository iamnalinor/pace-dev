import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

/**
Whether the system asks for reduced motion (Android's "Remove animations", the browser's
`prefers-reduced-motion`; react-native-web reads the media query). A kit preset then swaps its
travel and scale for an opacity fade (spec §3.8 `reduced`).

One store for the app (UI review I1): the system is asked once, at the app's start
(`seedReducedMotion`, from the root layout), and followed by one subscription; every component reads
the same value synchronously, so an overlay that mounts later plays the right preset from its first
frame instead of starting with full motion while its own question is in flight.
*/
const store = {
  isReduced: false,
  listeners: new Set<() => void>(),
  seeding: null as null | Promise<void>,
};

const set = (isReduced: boolean): void => {
  if (isReduced === store.isReduced) {
    return;
  }
  store.isReduced = isReduced;
  for (const listener of store.listeners) {
    listener();
  }
};

/** The browser answers the media query at once; elsewhere the first read waits for the system. */
const mediaQueryNow = (): boolean | undefined => {
  const { matchMedia } = globalThis as { matchMedia?: (query: string) => { matches: boolean } };
  return typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)").matches
    : undefined;
};

/** The system's answer; an unanswered question leaves the default (full motion). */
const readSystem = async (): Promise<void> => {
  try {
    set(await AccessibilityInfo.isReduceMotionEnabled());
  } catch {
    // No answer: motion stays as it is; a later change still arrives through the listener.
  }
};

/** Asks the system once and follows it from then on; later calls share the first. */
export const seedReducedMotion = async (): Promise<void> => {
  if (store.seeding === null) {
    const now = mediaQueryNow();
    if (now !== undefined) {
      set(now);
    }
    AccessibilityInfo.addEventListener("reduceMotionChanged", set);
    store.seeding = readSystem();
  }
  await store.seeding;
};

/** Tests only: back to the unseeded store (the subscription is the test's own spy). */
export const forgetReducedMotion = (): void => {
  store.isReduced = false;
  store.listeners.clear();
  store.seeding = null;
};

const subscribe = (listener: () => void): (() => void) => {
  store.listeners.add(listener);
  void seedReducedMotion();
  return () => {
    store.listeners.delete(listener);
  };
};

const isReducedNow = (): boolean => store.isReduced;

export const useIsMotionReduced = (): boolean =>
  useSyncExternalStore(subscribe, isReducedNow, isReducedNow);
