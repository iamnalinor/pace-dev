import { sha256Text } from "#app/platform/sha256-text.ts";

/** An opaque session marker for notifications; the bearer itself never enters system UI. */
export const sessionHashOf = async (token: string): Promise<string> => await sha256Text(token);

/** A late push or button tap from another account must not show or restore its private text. */
export const isForSession = async (
  data: unknown,
  token: null | string | undefined,
): Promise<boolean> => {
  if (token === null || token === undefined || typeof data !== "object" || data === null) {
    return false;
  }
  const hash = "sessionHash" in data ? data.sessionHash : null;
  return typeof hash === "string" && hash === (await sessionHashOf(token));
};
