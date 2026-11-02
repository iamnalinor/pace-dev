import type { StoreApi } from "zustand/vanilla";

import * as SecureStore from "expo-secure-store";

/**
A preference shown at once and saved after (bug-lessons 57: a tap's result never waits for the
phone's storage, slow on Android's keystore): `change` goes into the store first, then `save`
runs; a refused save puts back what those fields held before (unless a later change replaced
them meanwhile) and rethrows.
*/
export const shownThenSaved = async <S extends object>(
  store: StoreApi<S>,
  change: Partial<S>,
  save: () => Promise<void>,
): Promise<void> => {
  const before = store.getState();
  const previous = Object.fromEntries(
    Object.keys(change).map((key) => [key, before[key as keyof S]]),
  ) as Partial<S>;
  store.setState(change);
  try {
    await save();
  } catch (error) {
    // Only what this change still holds: a later pick made meanwhile stays.
    const now = store.getState();
    const isStillOurs = Object.entries(change).every(([key, value]) =>
      Object.is(now[key as keyof S], value),
    );
    if (isStillOurs) {
      store.setState(previous);
    }
    throw error;
  }
};

/** Saves a value in the keystore, or removes the key for `null`. */
export const secureSave = async (key: string, value: null | string): Promise<void> => {
  await (value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value));
};
