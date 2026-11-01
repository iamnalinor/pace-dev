import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import type { ApiClient } from "@pace/client";

import { endpoints, isAnswer, NOTIFICATION_KINDS, type NotificationKind } from "@pace/core";

import { backgroundApi, backgroundToken } from "./background-api.ts";
import { notificationIdOf } from "./notification-id.ts";
import {
  answerFromButton,
  dismissPoolNotification,
  type ShownContent,
  showPoolNotification,
} from "./notifications.ts";
import { rememberPushDismissal, wasPushDismissed } from "./push-dismissed.ts";
import { isForSession } from "./session-fingerprint.ts";

/** The task Android runs for a push (Firebase data message) and for an answer button tapped. */
export const PUSH_TASK = "pace.push";

const currentToken = async (api: ApiClient | null | undefined): Promise<null | string> =>
  api === undefined ? await backgroundToken() : (api?.currentSessionToken() ?? null);

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
    stillCurrent: async () => await isForSession(content.data, await currentToken(api)),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNotificationKind = (value: unknown): value is NotificationKind =>
  typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);

const incomingNotice = (
  data: unknown,
): null | {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly sessionHash: string;
  readonly url: string;
} => {
  if (!isRecord(data) || data["type"] !== "notification") {
    return null;
  }
  const id = notificationIdOf(data);
  if (
    id === null ||
    !isNotificationKind(data["kind"]) ||
    typeof data["paceTitle"] !== "string" ||
    typeof data["paceBody"] !== "string" ||
    typeof data["sessionHash"] !== "string"
  ) {
    return null;
  }
  return {
    body: data["paceBody"],
    id,
    kind: data["kind"],
    sessionHash: data["sessionHash"],
    url:
      typeof data["url"] === "string" && data["url"].startsWith("/")
        ? data["url"]
        : "/notifications",
    title: data["paceTitle"],
  };
};

const didHandleIncoming = async (
  data: unknown,
  api: ApiClient | null | undefined,
): Promise<boolean> => {
  const notice = incomingNotice(data);
  if (notice === null) {
    return false;
  }
  if (
    !(await isForSession(data, await currentToken(api))) ||
    (await wasPushDismissed(notice.sessionHash, notice.id))
  ) {
    return true;
  }
  await showPoolNotification(notice);
  if (
    !(await isForSession(data, await currentToken(api))) ||
    (await wasPushDismissed(notice.sessionHash, notice.id))
  ) {
    await dismissPoolNotification(notice.id);
  }
  return true;
};

const withdrawIncoming = async (
  data: unknown,
  api: ApiClient | null | undefined,
): Promise<void> => {
  const id = isDismissal(data) ? notificationIdOf(data) : null;
  if (id === null || !(await isForSession(data, await currentToken(api)))) {
    return;
  }
  const sessionHash = (data as { readonly sessionHash: string }).sessionHash;
  await rememberPushDismissal(sessionHash, id);
  await dismissPoolNotification(id);
};

/** One push or tap, with the app possibly closed. */
export const handlePushTask = async (payload: Payload, api?: ApiClient | null): Promise<void> => {
  const { actionIdentifier, data } = payload;
  if (typeof actionIdentifier === "string") {
    await answer({ ...payload, actionIdentifier }, api);
    return;
  }
  if (!(await didHandleIncoming(data, api))) {
    await withdrawIncoming(data, api);
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
