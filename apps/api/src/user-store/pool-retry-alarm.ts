/** Arms a retry without replacing an earlier alarm. */
export const armRetry = async (storage: DurableObjectStorage, now: string): Promise<void> => {
  const at = Date.parse(now) + 60_000;
  const existing = await storage.getAlarm();
  if (existing === null || at < existing) {
    await storage.setAlarm(at);
  }
};

/** The next pool decision or an outstanding delivery retry, whichever comes first. */
export const scheduleNextPass = async (
  storage: DurableObjectStorage,
  {
    now,
    nextAt,
    isRetry,
  }: { readonly now: string; readonly nextAt: null | string; readonly isRetry: boolean },
): Promise<void> => {
  const next = nextAt === null ? null : Date.parse(nextAt);
  const at = isRetry ? Math.min(next ?? Infinity, Date.parse(now) + 60_000) : next;
  await (at === null ? storage.deleteAlarm() : storage.setAlarm(at));
};
