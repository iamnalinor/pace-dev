import type { AccountAction, AccountConfirmation } from "@pace/client";

export type PendingConfirmation = {
  readonly action: AccountAction;
  readonly request: AccountConfirmation;
};

/** Native Settings stays mounted across the Telegram handoff; web has a storage sibling. */
export const readPendingConfirmation = (): null | PendingConfirmation => null;

export const savePendingConfirmation = (_pending: PendingConfirmation): void => undefined;

export const clearPendingConfirmation = (): void => undefined;
