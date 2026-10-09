import type { ErrorBoundaryProps } from "expo-router";

import { type ReactNode, useEffect, useState } from "react";
import { ScrollView, Share, Text, useColorScheme, View } from "react-native";

import { describeError, deviceLanguage, recordCrash } from "#app/platform/crash-log.ts";
import { paletteVars } from "#app/platform/theme.ts";
import { Button } from "#app/ui/button.tsx";
import { type MessageKey, t } from "@pace/core";

import { paceNative } from "../../../modules/pace-native/index.ts";

/**
A crash report on its own: it sits outside the app's providers (they may be what failed),
so it takes the theme and language from the device.
*/
const CrashReport = ({
  body,
  details,
  onContinue,
  continueLabel,
  onShared,
  title,
}: {
  readonly body: MessageKey;
  readonly details: string;
  readonly onContinue: () => void;
  readonly continueLabel: MessageKey;
  readonly onShared?: () => void;
  readonly title: MessageKey;
}) => {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const language = deviceLanguage();
  const share = async (): Promise<void> => {
    await Share.share({ message: details });
    onShared?.();
  };
  return (
    <View className="flex-1 bg-bg" style={paletteVars(scheme)}>
      <ScrollView contentContainerClassName="gap-4 px-6 pb-12 pt-16">
        <Text accessibilityRole="header" className="font-sans text-[24px] font-semibold text-fg">
          {t(language, title)}
        </Text>
        <Text className="font-sans text-[14px] text-muted">{t(language, body)}</Text>
        <Text className="rounded-md bg-surface p-3 font-mono text-[12px] text-warn" selectable>
          {details}
        </Text>
        <Button onPress={() => void share()}>{t(language, "crash.share")}</Button>
        <Button onPress={onContinue} variant="secondary">
          {t(language, continueLabel)}
        </Button>
      </ScrollView>
    </View>
  );
};

/** What a screen that failed to render shows instead of closing the app (root ErrorBoundary). */
export const CrashScreen = ({ error, retry }: ErrorBoundaryProps) => {
  useEffect(() => {
    recordCrash("render", error);
  }, [error]);
  return (
    <CrashReport
      body="errors.crashBody"
      continueLabel="errors.reload"
      details={describeError(error)}
      onContinue={() => void retry()}
      title="errors.crashTitle"
    />
  );
};

/**
After a crash the next launch stops here, before anything of the app starts (storage, sync,
background work): even a crash on every launch leaves the report reachable. Sharing or
opening the app marks the reports seen; Settings → Crash log keeps them.
*/
export const CrashGate = ({ children }: { readonly children: ReactNode }) => {
  const [unseen, setUnseen] = useState(() => paceNative.readUnseenCrashes());
  if (unseen === "") {
    return <>{children}</>;
  }
  return (
    <CrashReport
      body="crash.lastBody"
      continueLabel="crash.continue"
      details={unseen}
      onContinue={() => {
        paceNative.markCrashesSeen();
        setUnseen("");
      }}
      onShared={paceNative.markCrashesSeen}
      title="crash.lastTitle"
    />
  );
};
