import { useMemo } from "react";
import { useStore } from "zustand";

import { usePace, useSettings } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { type FeedModel, feedModel, type FeedState, type NotificationFeed } from "@pace/client";

/**
The notification feed as this client shows it: on a phone the kinds on for the app, in a
browser the ones on for the web (one rule, `feedModel`), with the bell's unread count. Its days
are the device's, like every other time the app shows (`zone`, for the times under them).
*/
export const useFeed = (): FeedState & {
  readonly model: FeedModel;
  readonly feed: NotificationFeed;
  readonly zone: string;
} => {
  const { clock, notifications } = usePace();
  const state = useStore(notifications.store);
  const settings = useSettings();
  const zone = clock.deviceTz;
  const model = useMemo(
    () => feedModel(state.items, { platform: IS_PHONE ? "app" : "web", settings, zone }),
    [settings, state.items, zone],
  );
  return { ...state, feed: notifications, model, zone };
};
