/*
`expo-secure-store` on the web build (swapped in by metro.config.js): the browser's
localStorage. It can be missing or throw (private windows, blocked site data); then nothing
is kept between page loads and the app still works.
*/

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** Runs a storage call, swallowing a blocked storage's errors. */
const attempt = <T>(run: (store: Storage | undefined) => T, fallback: T): Promise<T> => {
  try {
    return Promise.resolve(run(storage()));
  } catch {
    return Promise.resolve(fallback);
  }
};

export const getItemAsync = (key: string): Promise<null | string> =>
  attempt((store) => store?.getItem(key) ?? null, null);

export const setItemAsync = (key: string, value: string): Promise<void> =>
  attempt((store) => {
    store?.setItem(key, value);
  }, undefined);

export const deleteItemAsync = (key: string): Promise<void> =>
  attempt((store) => {
    store?.removeItem(key);
  }, undefined);
