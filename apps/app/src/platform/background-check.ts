import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import type { ApiClient } from "@pace/client";

import { backgroundApi, endBackgroundSessions } from "./background-api.ts";
import { pollNow, pushMethodOf } from "./notifications.ts";
import { uploadPhoneData } from "./phone-upload.ts";
import { seriallyBySession } from "./session-poll-queue.ts";

/** The task Android's WorkManager runs about every quarter hour, with the app closed or open. */
export const BACKGROUND_CHECK_TASK = "pace.background-check";

/** The shortest interval WorkManager allows; Android may stretch it (Doze, battery savers). */
export const BACKGROUND_INTERVAL_MINUTES = 15;

/** How a run ended: `failed` when any step did, even though the others still ran. */
export type BackgroundCheckResult = "done" | "failed" | "signed-out";

/** One step of a run, caught on its own so a failed step never holds the next one back. */
const didStepRun = async (step: () => Promise<void>): Promise<boolean> => {
  try {
    await step();
    return true;
  } catch {
    return false;
  }
};

/** The steps of a signed-in run, in order; `failed` when any did, though the rest still ran. */
const runSteps = async (api: ApiClient, now: () => string): Promise<BackgroundCheckResult> => {
  const steps: readonly (() => Promise<void>)[] = [
    async () => {
      if ((await pushMethodOf()) === "poll") {
        await pollNow(api);
      }
    },
    async () => {
      await uploadPhoneData(api, now());
    },
  ];
  let hasFailed = false;
  for (const step of steps) {
    hasFailed = !(await didStepRun(step)) || hasFailed;
  }
  return hasFailed ? "failed" : "done";
};

/**
One background run on a signed-in phone: a phone whose push method is `poll` fetches what waits
for it (shown and taken back as the open app would), then every phone sends its calendar and
usage, which the server's rules need at night as well. The client is the stored server's with the
token stored for that server (`backgroundApi`): signed out, or a token kept for another server,
sends nothing at all. Later steps (more phone data) join `runSteps`, each caught alone.
*/
export const runBackgroundCheck = async (
  deps: { readonly api?: ApiClient | null; readonly now?: () => string } = {},
): Promise<BackgroundCheckResult> => {
  const { api: given, now = () => new Date().toISOString() } = deps;
  const client = given === undefined ? await backgroundApi() : given;
  return client === null ? "signed-out" : await runSteps(client, now);
};

// Defined when this module loads (the root layout imports it), as the task manager requires.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- expo-task-manager needs the task defined at module load, before Android runs it
TaskManager.defineTask(BACKGROUND_CHECK_TASK, async () => {
  try {
    return (await runBackgroundCheck()) === "failed"
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
Set synchronously on start, so two starts in one tick register once. Registrations and
unregistrations run one after another on their own queue, so a logout never loses to a start
still on its way.
*/
const registration = { isStarted: false };
const REGISTRATION_QUEUE = "background-check:registration";

/**
Asks Android to run the check about every 15 minutes while signed in (each sign-in and start;
once per process, and not again when the task is already registered). Best effort: a phone that
refuses background work still polls and uploads whenever Pace is open.
*/
export const startBackgroundCheck = async (): Promise<void> => {
  if (registration.isStarted) {
    return;
  }
  registration.isStarted = true;
  await seriallyBySession(REGISTRATION_QUEUE, async () => {
    try {
      if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_CHECK_TASK))) {
        await BackgroundTask.registerTaskAsync(BACKGROUND_CHECK_TASK, {
          minimumInterval: BACKGROUND_INTERVAL_MINUTES,
        });
      }
    } catch {
      // Refused (no background work here): the next sign-in or start asks again, no loop.
      registration.isStarted = false;
    }
  });
};

/**
On logout: no more runs, and a run in flight goes quiet (its client stops sending the ended
session's token), so it neither shows nor sends anything for that session.
*/
export const stopBackgroundCheck = async (): Promise<void> => {
  registration.isStarted = false;
  endBackgroundSessions();
  await seriallyBySession(REGISTRATION_QUEUE, async () => {
    try {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_CHECK_TASK);
    } catch {
      // Not registered (never started, or Android refused it): nothing to stop.
    }
  });
};
