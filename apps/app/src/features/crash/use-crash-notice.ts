import { useEffect } from "react";
import { Alert, Share } from "react-native";

import { deviceLanguage } from "#app/platform/crash-log.ts";
import { t } from "@pace/core";

import { paceNative } from "../../../modules/pace-native/index.ts";

/**
After a crash, the next launch says so once and offers the report (the crash log keeps it
in Settings). Native crashes are only ever seen this way: the app was gone when they happened.
*/
export const useCrashNotice = (): void => {
  useEffect(() => {
    const unseen = paceNative.takeUnseenCrashes();
    if (unseen === "") {
      return;
    }
    const language = deviceLanguage();
    Alert.alert(t(language, "crash.lastTitle"), t(language, "crash.lastBody"), [
      { style: "cancel", text: t(language, "common.close") },
      {
        onPress: () => {
          void Share.share({ message: unseen });
        },
        text: t(language, "crash.share"),
      },
    ]);
  }, []);
};
