import type { PaceRuntime } from "./runtime.ts";

type OnSynced = (owner: null | string, isSynced: boolean) => void;

/**
The account's time zone from the device when it has none yet (never "not set"), written once per
session and only after a sync of that session succeeded: on an empty copy whose first pull failed
the account is unknown, and the device's zone would be pushed over the account's own on recovery,
skipping the zone question (QA round 23 R23-01, class 62).
*/
export const createZoneStep = (
  runtime: PaceRuntime,
): {
  /** `onSynced`, which also writes the zone after the first successful sync of each session. */
  readonly follow: (onSynced: OnSynced) => OnSynced;
  /** The zone write started by the latest successful sync, settled (the start waits for it). */
  readonly settled: () => Promise<void>;
} => {
  const state: { owner: string | undefined; write: Promise<void> } = {
    owner: undefined,
    write: Promise.resolve(),
  };
  const afterSync = (owner: string): void => {
    if (state.owner === owner) {
      return;
    }
    state.owner = owner;
    state.write = (async () => {
      try {
        await runtime.actions.ensureTimezone();
      } catch {
        // A failed local write leaves the zone unset; the next session's sync asks again.
      }
    })();
  };
  return {
    follow: (onSynced) => (owner, isSynced) => {
      onSynced(owner, isSynced);
      if (isSynced && owner !== null) {
        afterSync(owner);
      }
    },
    settled: async () => {
      await state.write;
    },
  };
};
