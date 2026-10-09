import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import type { ThemePreference } from "#app/platform/theme.ts";

import { useAuth, usePace, useSettings, useT } from "#app/app-state.tsx";
import { ConnectedApps } from "#app/features/oauth/connected-apps.tsx";
import { usePermissions } from "#app/features/permissions/use-permissions.ts";
import { CrashLogActions, useCrashLog } from "#app/features/settings/crash-log.tsx";
import { DeleteAccount } from "#app/features/settings/delete-account.tsx";
import { ExportRow } from "#app/features/settings/export-row.tsx";
import { DigestWindows, QuietHours } from "#app/features/settings/notification-settings.tsx";
import { SettingsLinks } from "#app/features/settings/settings-links.tsx";
import { TimezoneRow } from "#app/features/settings/timezone-row.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { Button } from "#app/ui/button.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { Segmented } from "#app/ui/segmented.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { LANGUAGES } from "@pace/core";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

const Row = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <View accessibilityLabel={label} className="gap-2 border-b border-line px-5 py-4" role="group">
    <Text
      accessibilityRole="header"
      className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted"
    >
      {label}
    </Text>
    {children}
  </View>
);

/** "Permissions · 2 of 4 on", opening the screen with each one. */
const PermissionsRow = () => {
  const t = useT();
  const router = useRouter();
  const { list } = usePermissions();
  const on = (list ?? []).filter((permission) => permission.state === "on").length;
  return (
    <Row label={t("settings.permissions")}>
      <Button
        onPress={() => {
          router.push("/permissions");
        }}
        variant="secondary"
      >
        {list === null
          ? t("settings.permissions")
          : t("settings.permissions.summary", { on, total: list.length })}
      </Button>
    </Row>
  );
};

/** Theme (this device) and language (the account). */
const LookRows = () => {
  const t = useT();
  const theme = useTheme();
  const settings = useSettings();
  const { actions } = usePace();
  return (
    <>
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
            void actions.setLanguage(language);
          }}
          options={LANGUAGES.map((value) => ({ label: t(`settings.language.${value}`), value }))}
          value={settings.language}
        />
      </Row>
    </>
  );
};

/** Shown only once something crashed (the log lives on the phone). */
const CrashLogRow = () => {
  const t = useT();
  const { clear, text } = useCrashLog();
  return text === "" ? null : (
    <Row label={t("settings.crashLog")}>
      <CrashLogActions onClear={clear} text={text} />
    </Row>
  );
};

export const SettingsScreen = () => {
  const t = useT();
  const router = useRouter();
  const { auth } = useAuth();
  const logout = async (): Promise<void> => {
    await auth.logout();
    router.replace("/login");
  };
  const header = (
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
  );
  return (
    <Screen header={header}>
      <LookRows />
      <Row label={t("settings.timezone")}>
        <TimezoneRow />
      </Row>
      {IS_PHONE ? <PermissionsRow /> : null}
      <Row label={t("settings.digestWindows")}>
        <DigestWindows />
      </Row>
      <Row label={t("settings.quietHours")}>
        <QuietHours />
      </Row>
      <Row label={t("settings.more")}>
        <SettingsLinks />
      </Row>
      {IS_PHONE ? null : (
        <Row label={t("settings.export")}>
          <ExportRow />
        </Row>
      )}
      <Row label={t("settings.connectedApps")}>
        <ConnectedApps />
      </Row>
      {IS_PHONE ? <CrashLogRow /> : null}
      <View className="gap-3 px-5 py-6">
        <Button onPress={() => void logout()} variant="secondary">
          {t("settings.logout")}
        </Button>
        <DeleteAccount />
      </View>
    </Screen>
  );
};
