import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { type ApiClient, createApiClient } from "@pace/client";
import { endpoints } from "@pace/core";

import { API_BASE_URL } from "./api-base.ts";
import {
  answerFromButton,
  dismissPoolNotification,
  isAnswer,
  notificationIdOf,
  type ShownContent,
} from "./notifications.ts";
import { createSecureSessionStore } from "./secure-session.ts";

/** The task Android runs for a push (Firebase data message) and for an answer button tapped. */
export const PUSH_TASK = "pace.push";

/** The API as the signed-in phone, from the stored session (`null` when signed out). */
const backgroundApi = async (): Promise<ApiClient | null> => {
  const token = await createSecureSessionStore().get();
  return token === null ? null : createApiClient({ baseUrl: API_BASE_URL, token: () => token });
};

type Payload = {
  readonly actionIdentifier?: unknown;
  readonly notification?: { readonly request?: { readonly content?: ShownContent } };
  readonly data?: unknown;
};

/**
An answer button (Attend, Skip, "Yes, still", Stop): answered through the same endpoint as
every channel (the server takes the notification back elsewhere); it goes from this phone once
the answer is saved, and stays, saying so, when it is not (`answerFromButton`).
*/
const answer = async (
  payload: Payload & { readonly actionIdentifier: string },
  api: ApiClient | null | undefined,
): Promise<void> => {
  const content = payload.notification?.request?.content ?? {};
  const id = notificationIdOf(content.data);
  const resolution = payload.actionIdentifier;
  if (id === null || !isAnswer(resolution)) {
    return;
  }
  const client = api === undefined ? await backgroundApi() : api;
  await answerFromButton({
    content,
    id,
    save: async () => {
      if (client === null) {
        return false;
      }
      await client.call(endpoints.notifications.resolve, {
        body: { from: "app", resolution },
        params: { id },
      });
      return true;
    },
  });
};

/** Whether a push's data is a dismissal (Firebase's silent `dismiss`). */
const isDismissal = (data: unknown): boolean =>
  typeof data === "object" && data !== null && "type" in data && data.type === "dismiss";

/**
One push or tap, with the app possibly closed: a `dismiss` data message takes the notification
away at once; an answer button answers (`answer`).
*/
export const handlePushTask = async (payload: Payload, api?: ApiClient | null): Promise<void> => {
  const { actionIdentifier, data } = payload;
  if (typeof actionIdentifier === "string") {
    await answer({ ...payload, actionIdentifier }, api);
    return;
  }
  const id = isDismissal(data) ? notificationIdOf(data) : null;
  if (id !== null) {
    await dismissPoolNotification(id);
  }
};

/** A push while the app is open shows like any other; a silent one (a dismissal) shows nothing. */
// eslint-disable-next-line unicorn/no-top-level-side-effects -- the handler must be set before the first notification arrives
Notifications.setNotificationHandler({
  handleNotification: (notification) => {
    const isShown = (notification.request.content.title ?? "") !== "";
    return Promise.resolve({
      shouldPlaySound: isShown,
      shouldSetBadge: false,
      shouldShowBanner: isShown,
      shouldShowList: isShown,
    });
  },
});

// Defined when this module loads (the root layout imports it), as the task manager requires.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- expo-task-manager needs the task defined at module load, before Android runs it
TaskManager.defineTask<Payload>(PUSH_TASK, async ({ data }) => {
  try {
    await handlePushTask(data);
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch {
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

/** Asks expo-notifications to run the task for pushes and answer buttons (again is harmless). */
export const startPushTask = async (): Promise<void> => {
  try {
    await Notifications.registerTaskAsync(PUSH_TASK);
  } catch {
    // Without it a tap opens the app instead; nothing else changes.
  }
};
