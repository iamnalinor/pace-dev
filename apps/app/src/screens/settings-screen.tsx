import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { type Language, LANGUAGES } from "@pace/core";

import type { ThemePreference } from "../platform/theme.ts";

import { useAuth, usePace, useSettings, useT } from "../app-state.tsx";
import { Button } from "../ui/button.tsx";
import { ScreenHeader } from "../ui/screen-header.tsx";
import { Segmented } from "../ui/segmented.tsx";
import { useTheme } from "../ui/theme-provider.tsx";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** The zone this device reports; the account zone defaults to it on first login. */
export const deviceTimeZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

const Row = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <View className="gap-2 border-b border-line px-5 py-4">
    <Text className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{label}</Text>
    {children}
  </View>
);

export const SettingsScreen = () => {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const settings = useSettings();
  const { auth } = useAuth();
  const { state } = usePace();
  const deviceZone = deviceTimeZone();

  const update = (payload: { readonly language?: Language; readonly timezone?: string }): void => {
    void state.dispatch({
      occurredAt: new Date().toISOString(),
      payload,
      type: "settings.updated",
    });
  };

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        right={
          <Button
            onPress={() => {
              router.back();
            }}
            variant="ghost"
          >
            {t("common.done")}
          </Button>
        }
        title={t("settings.title")}
      />
      <Row label={t("settings.theme")}>
        <Segmented
          onChange={theme.setPreference}
          options={THEME_PREFERENCES.map((value) => ({
            label: t(`settings.theme.${value}`),
            value,
          }))}
          value={theme.preference}
        />
      </Row>
      <Row label={t("settings.language")}>
        <Segmented
          onChange={(language) => {
            update({ language });
          }}
          options={LANGUAGES.map((value) => ({ label: t(`settings.language.${value}`), value }))}
          value={settings.language}
        />
      </Row>
      <Row label={t("settings.timezone")}>
        <Text className="font-sans text-[15px] text-fg">{settings.timezone ?? deviceZone}</Text>
        <Text className="font-sans text-[13px] text-muted">
          {t("settings.timezone.device", { tz: deviceZone })}
        </Text>
        {settings.timezone === deviceZone ? null : (
          <Button
            onPress={() => {
              update({ timezone: deviceZone });
            }}
            variant="secondary"
          >
            {t("settings.timezone.use", { tz: deviceZone })}
          </Button>
        )}
      </Row>
      <View className="px-5 py-6">
        <Button onPress={() => void auth.logout()} variant="secondary">
          {t("settings.logout")}
        </Button>
      </View>
    </View>
  );
};
