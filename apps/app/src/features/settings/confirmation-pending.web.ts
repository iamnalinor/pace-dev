import type { PendingConfirmation } from "./confirmation-pending.ts";

const KEY = "pace.account-confirmation";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLiveRequest = (value: unknown, now: number): value is PendingConfirmation["request"] => {
  if (!isRecord(value)) {
    return false;
  }
  const { expiresAt, id } = value;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    typeof expiresAt === "string" &&
    Date.parse(expiresAt) > now
  );
};

const isLivePending = (value: unknown, now: number): value is PendingConfirmation =>
  isRecord(value) &&
  (value["action"] === "wipe" || value["action"] === "delete") &&
  isLiveRequest(value["request"], now);

/** Keep the opaque request while the owner confirms in Telegram. */
export const readPendingConfirmation = (now: number): null | PendingConfirmation => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (isLivePending(parsed, now)) {
      return {
        action: parsed.action,
        request: { expiresAt: parsed.request.expiresAt, id: parsed.request.id },
      };
    }
  } catch {
    // Storage can be disabled; the current page still tracks the request.
  }
  clearPendingConfirmation();
  return null;
};

export const savePendingConfirmation = (pending: PendingConfirmation): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // The current page still polls.
  }
};

export const clearPendingConfirmation = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // The entry expires on its own.
  }
};
