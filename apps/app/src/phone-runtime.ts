import * as Notifications from "expo-notifications";

import type { PaceRuntime } from "#app/runtime.ts";

import { IS_PHONE } from "#app/platform/device.ts";
import { notificationIdOf } from "#app/platform/notification-id.ts";
import {
  answerFromButton,
  dismissPoolNotification,
  pollNow,
  pushStore,
  registerPush,
  setupNotificationCategories,
} from "#app/platform/notifications.ts";
import { uploadPhoneData } from "#app/platform/phone-upload.ts";
import { startPushTask } from "#app/platform/push-task.ts";
import { isForSession } from "#app/platform/session-fingerprint.ts";
import { isAnswer } from "@pace/core";

/** The phone's calendar and app usage, sent beside the event log (nothing on the web). */
export const sendPhoneData = async (runtime: PaceRuntime): Promise<void> => {
  if (IS_PHONE) {
    await uploadPhoneData(runtime.api, runtime.clock.now());
  }
};

/**
The phone's side of the notification pool, on every start and return: the answer buttons,
the push method (registered again: a token may have changed) and, when it polls, what waits.
*/
export const startPhonePush = async (runtime: PaceRuntime): Promise<void> => {
  if (!IS_PHONE) {
    return;
  }
  try {
    await setupNotificationCategories(runtime.state.store.getState().settings.language);
    await startPushTask();
    if ((await registerPush(runtime.api)) === "poll") {
      await pollNow(runtime.api);
    }
  } catch {
    // Offline: the next start or return tries again; the feed has everything meanwhile.
  }
};

/**
What the live socket says about the pool, on a phone: a notification resolved elsewhere goes
away at once; a polling phone fetches what waits for it right away; changed push methods mean
registering again. And an answer button tapped while the app is open answers like the feed.
*/
export const followPhoneNotices = (runtime: PaceRuntime): (() => void) => {
  if (!IS_PHONE) {
    return () => undefined;
  }
  const pollIfPolling = (): void => {
    if (pushStore.getState().method === "poll") {
      void (async () => {
        try {
          await pollNow(runtime.api);
        } catch {
          // Offline: the next notice or start fetches it.
        }
      })();
    }
  };
  const stopNotices = runtime.onNotice((notice) => {
    switch (notice.type) {
      case "push-methods-changed": {
        void startPhonePush(runtime);
        break;
      }
      case "dismiss": {
        void dismissPoolNotification(notice.id);
        pollIfPolling();
        break;
      }
      case "notification": {
        pollIfPolling();
        break;
      }
      case "read": {
        break;
      }
    }
  });
  const responses = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = notificationIdOf(response.notification.request.content.data);
    if (id === null || !isAnswer(response.actionIdentifier)) {
      return;
    }
    const resolution = response.actionIdentifier;
    void answerFromButton({
      content: response.notification.request.content,
      id,
      save: async () => await runtime.notifications.resolve(id, resolution),
      stillCurrent: async () =>
        await isForSession(
          response.notification.request.content.data,
          runtime.api.currentSessionToken(),
        ),
    });
  });
  return () => {
    stopNotices();
    responses.remove();
  };
};
