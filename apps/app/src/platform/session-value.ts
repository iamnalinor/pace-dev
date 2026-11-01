import * as SecureStore from "expo-secure-store";

/** A progress marker belongs to the session whose server queue or upload it advances. */
export const readSessionValue = async (key: string, session: string): Promise<unknown> => {
  try {
    const stored = await SecureStore.getItemAsync(key);
    const parsed: unknown = stored === null ? null : JSON.parse(stored);
    return typeof parsed === "object" &&
      parsed !== null &&
      "session" in parsed &&
      parsed.session === session &&
      "value" in parsed
      ? parsed.value
      : null;
  } catch {
    return null;
  }
};

/** A completed request from an old session must not advance the new session's marker. */
export const writeSessionValue = async ({
  key,
  session,
  value,
  isCurrentSession,
}: {
  readonly key: string;
  readonly session: string;
  readonly value: number | Readonly<Record<string, boolean | number | string>> | string;
  readonly isCurrentSession: () => boolean;
}): Promise<void> => {
  if (isCurrentSession()) {
    await SecureStore.setItemAsync(key, JSON.stringify({ session, value }));
  }
};
