import * as SecureStore from "expo-secure-store";

import { sessionHashOf } from "./session-fingerprint.ts";

/** A durable tombstone: FCM may deliver the withdrawal before the original message. */
const keyOf = async (sessionHash: string, notificationId: string): Promise<string> =>
  `pace.push.dismissed.${sessionHash}.${await sessionHashOf(notificationId)}`;

export const rememberPushDismissal = async (
  sessionHash: string,
  notificationId: string,
): Promise<void> => {
  await SecureStore.setItemAsync(await keyOf(sessionHash, notificationId), "1");
};

export const wasPushDismissed = async (
  sessionHash: string,
  notificationId: string,
): Promise<boolean> =>
  (await SecureStore.getItemAsync(await keyOf(sessionHash, notificationId))) === "1";
