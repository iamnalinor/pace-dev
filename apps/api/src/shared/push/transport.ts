import type { PoolNotification } from "@pace/core";

/**
How a device asked to get system notifications. Each device (session) has exactly one, set by
the app: Firebase Cloud Messaging, or `poll` (its periodic background check fetches what waits
for it); without one (`none`) it only sees the feed while it is open. A new method is one
module and an entry in `registry.ts`.
*/
export const PUSH_METHODS = ["fcm", "poll"] as const;

export type PushMethod = (typeof PUSH_METHODS)[number];

/** A notification as a device shows it: the pool item and its text in the account language. */
export type PushMessage = {
  readonly notification: PoolNotification;
  readonly title: string;
  readonly body: string;
};

/** One device's push address: the FCM token; for polling, the session itself. */
export type DeviceAddress = { readonly sessionId: string; readonly endpoint: string };

/**
`sent`; `queued`: waiting for the device to fetch it; `gone`: this device's address is dead (its
subscription is dropped; the app registers again on its next start); `unavailable`: the
server's own credentials for the method were refused, so the method is broken for every
device; `failed`: not this time.
*/
export type SendOutcome = "failed" | "gone" | "queued" | "sent" | "unavailable";

/**
A way to put a notification on a device and take it back. The device shows it under the pool
id, so a copy sent again (a retried alarm) replaces the first instead of stacking.
*/
export type PushTransport = {
  readonly method: PushMethod;
  /** Which credentials the transport sends with: a method broken with them is retried with others. */
  readonly fingerprint: string;
  readonly send: (to: DeviceAddress, message: PushMessage) => Promise<SendOutcome>;
  readonly dismiss: (to: DeviceAddress, notificationId: string) => Promise<void>;
};
