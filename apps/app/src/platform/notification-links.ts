import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "#app/app-state.tsx";
import { isBarePath } from "#app/auth/route-gate.tsx";

/**
The notifications whose tap was already taken (followed, or dropped signed out), for the whole
run of the app: the follower remounts whenever the route gate or the versions screen gives way,
and its hook reads the phone's last tap afresh on every mount. Kept per instance, a tap was
followed again on each remount, and with the gate redirecting back, without end (QA round 17
round-3 review C1, bug class 36).
*/
const taken = new Set<string>();

/** Takes a tap once: no later mount follows it, and the phone forgets it as the last response. */
const take = (identifier: string): void => {
  taken.add(identifier);
  Notifications.clearLastNotificationResponse();
};

/** The link a tap points at and the notification it came from; `null`: nothing to open. */
const linkOf = (
  response: Notifications.NotificationResponse | null | undefined,
): null | { readonly identifier: string; readonly url: string } => {
  const url: unknown = response?.notification.request.content.data?.["url"];
  return typeof url === "string" &&
    response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ? { identifier: response.notification.request.identifier, url }
    : null;
};

/**
Opens the screen a tapped notification points at (`data.url`), also on a cold start, once per
tap. Only signed in, past the walk-through: the gate lets bare paths (the login screen, the
walk-through) through without a session, and a link pushed from there was sent straight back. A
tap that arrives signed out is dropped, not kept for after signing in: it may be a reminder of
another account's task.
*/
const useNotificationLinks = (): void => {
  const router = useRouter();
  const path = usePathname();
  const { status } = useAuth();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const link = linkOf(response);
    if (link === null || taken.has(link.identifier)) {
      return;
    }
    if (status === "signed-out") {
      take(link.identifier);
      return;
    }
    // Still reading the session, or on the walk-through: the tap waits for a gated screen.
    if (status !== "signed-in" || isBarePath(path)) {
      return;
    }

    take(link.identifier);
    router.push(link.url);
  }, [path, response, router, status]);
};

/**
Follows notification taps from inside the app's Stack (its `layout`, past the route gate), so a
cold start's tap is pushed onto a navigator that exists: from above `NavigatorHold` it ran while
the hold still showed a blank page (bug class 61).
*/
export const NotificationLinks = (): null => {
  useNotificationLinks();
  return null;
};
