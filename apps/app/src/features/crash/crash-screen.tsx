import type { ErrorBoundaryProps } from "expo-router";

import { useEffect } from "react";
import { ScrollView, Share, Text, useColorScheme, View } from "react-native";

import { describeError, deviceLanguage, recordCrash } from "#app/platform/crash-log.ts";
import { paletteVars } from "#app/platform/theme.ts";
import { Button } from "#app/ui/button.tsx";
import { t } from "@pace/core";

/**
What a screen that failed to render shows instead of closing the app: the error and its
stack, a reload, and the report to share. It sits outside the app's providers (they may be
what failed), so it takes the theme and language from the device.
*/
export const CrashScreen = ({ error, retry }: ErrorBoundaryProps) => {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const language = deviceLanguage();
  const details = describeError(error);
  useEffect(() => {
    recordCrash("render", error);
  }, [error]);
  return (
    <View className="flex-1 bg-bg" style={paletteVars(scheme)}>
      <ScrollView contentContainerClassName="gap-4 px-6 pb-12 pt-16">
        <Text accessibilityRole="header" className="font-sans text-[24px] font-semibold text-fg">
          {t(language, "errors.crashTitle")}
        </Text>
        <Text className="font-sans text-[14px] text-muted">{t(language, "errors.crashBody")}</Text>
        <Text className="rounded-md bg-surface p-3 font-mono text-[12px] text-warn" selectable>
          {details}
        </Text>
        <Button onPress={() => void retry()}>{t(language, "errors.reload")}</Button>
        <Button onPress={() => void Share.share({ message: details })} variant="secondary">
          {t(language, "crash.share")}
        </Button>
      </ScrollView>
    </View>
  );
};
