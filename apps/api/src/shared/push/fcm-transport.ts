import { ANSWERS } from "@pace/core";

import type { PushTransport } from "./transport.ts";

import { type FcmTarget, sendFcm } from "../fcm.ts";

/** Where a tap on a notification opens the app. */
const urlOf = (kind: string): string => (kind === "deadline_digest" ? "/" : "/notifications");

/**
Firebase Cloud Messaging: data-only, high-priority messages the app presents itself (expo-
notifications shows `title`/`message` under the `tag`, with the `categoryId`'s buttons), and
silent `dismiss` messages that take one back. Both carry the pool id as the tag and collapse key.
*/
export const fcmTransport = (target: FcmTarget): PushTransport => ({
  dismiss: async (to, notificationId) => {
    const outcome = await sendFcm(target, {
      collapseKey: `dismiss:${notificationId}`,
      data: { notificationId, type: "dismiss" },
      token: to.endpoint,
    });
    if (outcome === "sent") {
      return "sent";
    }
    return outcome === "unregistered" ? "gone" : "failed";
  },
  fingerprint: target.fingerprint,
  method: "fcm",
  send: async (to, { body, notification, title }) => {
    const outcome = await sendFcm(target, {
      collapseKey: notification.id,
      data: {
        body: JSON.stringify({
          kind: notification.kind,
          notificationId: notification.id,
          url: urlOf(notification.kind),
        }),
        message: body,
        tag: notification.id,
        title,
        type: "notification",
        ...(ANSWERS[notification.kind].length > 0 && { categoryId: notification.kind }),
      },
      token: to.endpoint,
    });
    switch (outcome) {
      case "unregistered": {
        return "gone";
      }
      case "mismatch": {
        return "incompatible";
      }
      case "auth": {
        return "unavailable";
      }
      case "failed":
      case "sent": {
        return outcome;
      }
    }
  },
});
