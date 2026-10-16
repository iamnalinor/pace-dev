/** Android keeps its login screen in memory; the web sibling restores page reloads. */
export type PendingBotLogin = { readonly expiresAt: number; readonly nonce: string };

export const readPendingBotLogin = (_now: number): null | PendingBotLogin => null;

export const savePendingBotLogin = (_pending: PendingBotLogin): void => undefined;

export const clearPendingBotLogin = (): void => undefined;
