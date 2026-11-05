import type { Pool } from "./runtime-pool.ts";
import type { PaceRuntime } from "./runtime.ts";

import { claimLocalCopy } from "./local-copy.ts";
import { sendPhoneData, startPhonePush } from "./phone-runtime.ts";
import { startBackgroundCheck } from "./platform/background-check.ts";
import { IS_PHONE } from "./platform/device.ts";
import { canStartSenders, startSenders } from "./senders.ts";

/**
A signed-in start: the local copy claimed, this week's homework instances, a first sync, then the time zone that sync
allowed (`createZoneStep`, run by the sync's own end), before the senders push it.
*/
export const bootstrap = async (
  runtime: PaceRuntime,
  {
    pool,
    session,
    zoneSettled,
    isActive = () => true,
  }: {
    readonly pool: Pool;
    readonly session: string | undefined;
    readonly zoneSettled: () => Promise<void>;
    readonly isActive?: () => boolean;
  },
): Promise<void> => {
  const { actions, sync } = runtime;
  const canContinue = () => isActive() && canStartSenders(runtime);
  // The copy is this session's before anything is written into it (re-review N3).
  await claimLocalCopy(runtime, session);
  if (!canContinue()) {
    return;
  }
  if (IS_PHONE) {
    // Every signed-in phone, before any network step (one failing must not skip it): it polls
    // when its method is `poll`, and always uploads its usage.
    void startBackgroundCheck();
  }
  const steps = [
    () => actions.ensureInstances(),
    () => sync.syncNow(),
    zoneSettled,
    () => pool.refresh(),
    () => sendPhoneData(runtime),
    () => startPhonePush(runtime),
  ];
  for (const step of steps) {
    await step();
    if (!canContinue()) {
      return;
    }
  }
  // Signed out meanwhile, or ending this device's session: no loop, no socket. Otherwise its
  // first tick pushes what the bootstrap added.
  startSenders(runtime);
};
