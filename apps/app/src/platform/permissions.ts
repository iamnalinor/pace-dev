import * as Notifications from "expo-notifications";
import { Linking } from "react-native";

import { paceNative } from "../../modules/pace-native/index.ts";
import { calendarAccess, requestCalendarAccess } from "./phone-calendar.ts";
import { hasUsageAccess, openUsageAccessSettings } from "./phone-data.ts";

/** Everything Pace may ask Android for, in the order it is explained and asked. */
export const PERMISSION_IDS = ["notifications", "calendar", "usage"] as const;

export type PermissionId = (typeof PERMISSION_IDS)[number];

/**
`blocked`: refused for good, only the app's settings page can turn it on. A `settings` one is
granted on an Android settings screen, not in a dialog: it is known only when the person is back.
*/
export type Permission = {
  readonly id: PermissionId;
  readonly state: "blocked" | "off" | "on";
  readonly kind: "dialog" | "settings";
  /** Android greys it out until "restricted settings" are allowed (usage access, APK install). */
  readonly restricted: boolean;
};

const dialogState = (isGranted: boolean, canAskAgain: boolean): Permission["state"] => {
  if (isGranted) {
    return "on";
  }
  return canAskAgain ? "off" : "blocked";
};

const readOne = async (id: PermissionId): Promise<Permission> => {
  switch (id) {
    case "notifications": {
      const current = await Notifications.getPermissionsAsync();
      return {
        id,
        kind: "dialog",
        restricted: false,
        state: dialogState(current.granted, current.canAskAgain),
      };
    }
    case "calendar": {
      const access = await calendarAccess();
      return {
        id,
        kind: "dialog",
        restricted: false,
        state: dialogState(access === "granted", access !== "denied"),
      };
    }
    case "usage": {
      return {
        id,
        kind: "settings",
        restricted: paceNative.restrictsSettings(),
        state: hasUsageAccess() ? "on" : "off",
      };
    }
  }
};

/** Where each permission stands right now. */
export const readPermissions = async (): Promise<readonly Permission[]> =>
  await Promise.all(PERMISSION_IDS.map(async (id) => await readOne(id)));

/**
Pace's own App info page in Android settings: where a sideloaded app's "restricted settings"
are lifted (⋮ → Allow restricted settings) before usage access can be granted.
*/
export const openAppInfo = async (): Promise<void> => {
  await Linking.openSettings();
};

/** Asks in a dialog, or opens the Android screen where it is granted (or unblocked). */
export const requestPermission = async (permission: Permission): Promise<void> => {
  if (permission.state === "blocked") {
    await Linking.openSettings();
    return;
  }
  switch (permission.id) {
    case "notifications": {
      await Notifications.requestPermissionsAsync();
      return;
    }
    case "calendar": {
      await requestCalendarAccess();
      return;
    }
    case "usage": {
      openUsageAccessSettings();
      return;
    }
  }
};
