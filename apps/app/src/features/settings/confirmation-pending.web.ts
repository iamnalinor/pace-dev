import type { PendingConfirmation } from "./confirmation-pending.ts";

const KEY = "pace.account-confirmation";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Well-formed is enough: whether it is still live is the server's answer, not this clock's. */
const isRequest = (value: unknown): value is PendingConfirmation["request"] => {
  if (!isRecord(value)) {
    return false;
  }
  const { expiresAt, id } = value;
  return typeof id === "string" && id.length > 0 && typeof expiresAt === "string";
};

const isPending = (value: unknown): value is PendingConfirmation =>
  isRecord(value) &&
  (value["action"] === "wipe" || value["action"] === "delete") &&
  isRequest(value["request"]);

/** Keep the opaque request while the owner confirms in Telegram. */
export const readPendingConfirmation = (): null | PendingConfirmation => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (isPending(parsed)) {
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
