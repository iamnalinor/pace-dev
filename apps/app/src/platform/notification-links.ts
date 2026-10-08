import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

/** Opens the screen a tapped notification points at (`data.url`), also on a cold start. */
export const useNotificationLinks = (): void => {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url: unknown = response?.notification.request.content.data?.["url"];
    if (
      typeof url === "string" &&
      response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      router.push(url);
    }
  }, [response, router]);
};
