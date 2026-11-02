import { reloadAppAsync } from "expo";
import { useState } from "react";
import { Text, View } from "react-native";

import { deviceLanguage } from "#app/platform/device-language.ts";
import { Button } from "#app/ui/button.tsx";
import { t } from "@pace/core";

import { paceNative } from "../../modules/pace-native/index.ts";

/** The error with its stack, as the crash file keeps it (Hermes' stack starts with the message). */
const traceOf = (error: Error): string => {
  const stack = error.stack ?? `${error.name}: ${error.message}`;
  return `Shown on the crash screen (the app kept running)\n\n${stack}`;
};

/**
What a screen threw, instead of a blank page: a short apology, the error itself (to quote in a
bug report) and Reload, which restarts the app (on the web: the page, picking up a fixed build).
On a phone the stack also goes to Download/Pace, as a crash's does, and the screen says where.
*/
export const CrashScreen = ({ error }: { readonly error: Error }) => {
  const language = deviceLanguage();
  // Saved once, when the screen first shows: the boundary renders a new one for a new error.
  const [savedAt] = useState(() => paceNative.saveCrashTrace(traceOf(error)));
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-app px-6">
      <Text accessibilityRole="header" className="font-sans text-title2 text-label-primary">
        {t(language, "crash.title")}
      </Text>
      <Text className="max-w-inspector-max text-center font-sans text-subhead font-normal text-label-secondary">
        {t(language, "crash.body")}
      </Text>
      <Text
        className="max-w-inspector-max text-center font-sans text-caption font-normal text-label-tertiary"
        selectable
      >
        {error.message}
      </Text>
      {savedAt === null ? null : (
        <Text
          className="max-w-inspector-max text-center font-sans text-caption font-normal text-label-tertiary"
          selectable
        >
          {t(language, "crash.savedAt", { path: savedAt })}
        </Text>
      )}
      <Button
        onPress={() => {
          void reloadAppAsync();
        }}
        width="fill"
      >
        {t(language, "crash.retry")}
      </Button>
    </View>
  );
};
