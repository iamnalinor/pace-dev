import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

/**
Opens the screen a tapped notification points at (`data.url`), also on a cold start, once per
tap: the router's identity changes as it navigates, and a tap followed again pushed the screen
again (before the Stack existed, without end: QA round 17 review I3).
*/
const useNotificationLinks = (): void => {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const followedRef = useRef<unknown>(null);
  useEffect(() => {
    const url: unknown = response?.notification.request.content.data?.["url"];
    if (
      !(
        typeof url === "string" &&
        response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) ||
      followedRef.current === response
    ) {
      return;
    }

    followedRef.current = response;
    router.push(url);
  }, [response, router]);
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
