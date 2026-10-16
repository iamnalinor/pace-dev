import type { PendingBotLogin } from "./bot-login-pending.ts";

const KEY = "pace.bot-login";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLivePending = (value: unknown, now: number): value is PendingBotLogin => {
  if (!isRecord(value)) {
    return false;
  }
  const { expiresAt, nonce } = value;
  return (
    typeof nonce === "string" &&
    nonce.length > 0 &&
    typeof expiresAt === "number" &&
    Number.isFinite(expiresAt) &&
    expiresAt > now
  );
};

/** A short-lived nonce survives reloads in this tab while Telegram completes the sign-in. */
export const readPendingBotLogin = (now: number): null | PendingBotLogin => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (isLivePending(parsed, now)) {
      return { expiresAt: parsed.expiresAt, nonce: parsed.nonce };
    }
  } catch {
    // Private browsers may refuse storage; login still works while this page stays open.
  }
  clearPendingBotLogin();
  return null;
};

export const savePendingBotLogin = (pending: PendingBotLogin): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // The live page can still poll.
  }
};

export const clearPendingBotLogin = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // The entry expires on its own.
  }
};
