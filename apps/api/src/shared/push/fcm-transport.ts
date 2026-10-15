import { ANSWERS } from "@pace/core";

import type { DeviceAddress, PushTransport, SendOutcome } from "./transport.ts";

import { type FcmTarget, sendFcm } from "../fcm.ts";

/** Where a tap on a notification opens the app. */
const urlOf = (kind: string): string => (kind === "deadline_digest" ? "/" : "/notifications");

const dismissFcm = async (
  target: FcmTarget,
  to: DeviceAddress,
  notificationId: string,
): Promise<SendOutcome> => {
  const outcome = await sendFcm(target, {
    collapseKey: notificationId,
    data: { notificationId, sessionHash: to.sessionHash, type: "dismiss" },
    token: to.endpoint,
  });
  switch (outcome) {
    case "sent": {
      return "sent";
    }
    case "unregistered": {
      return "gone";
    }
    case "mismatch": {
      return "incompatible";
    }
    case "auth": {
      return "unavailable";
    }
    case "failed": {
      return "failed";
    }
  }
};

/**
Firebase Cloud Messaging: data-only, high-priority messages with text in private `paceTitle` and
`paceBody` fields. The app checks the session hash before presenting them; Expo's native Firebase
receiver would present `title`/`message` immediately, before that check. Dismissals carry the same
session hash. Both use the pool id as the collapse key.
*/
export const fcmTransport = (target: FcmTarget): PushTransport => ({
  dismiss: async (to, notificationId) => await dismissFcm(target, to, notificationId),
  fingerprint: target.fingerprint,
  method: "fcm",
  send: async (to, { body, notification, title }) => {
    const outcome = await sendFcm(target, {
      collapseKey: notification.id,
      data: {
        kind: notification.kind,
        notificationId: notification.id,
        paceBody: body,
        paceTitle: title,
        sessionHash: to.sessionHash,
        tag: notification.id,
        type: "notification",
        url: urlOf(notification.kind),
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
