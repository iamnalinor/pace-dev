import * as SecureStore from "expo-secure-store";

/** What the person waved away on this phone: a sleep stretch, a calendar event. Kept on the device. */
const KEY = "pace.phone.dismissed";
/** Only recent choices matter; older ones are dropped. */
const KEEP = 200;

const load = async (): Promise<readonly string[]> => {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    const parsed: unknown = stored === null ? [] : JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

export const dismissedKeys = async (): Promise<ReadonlySet<string>> => new Set(await load());

export const dismiss = async (key: string): Promise<void> => {
  const current = await load();
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify([...current.filter((item) => item !== key), key].slice(-KEEP)),
  );
};
