import { View } from "react-native";

import type { ThemePreference } from "#app/platform/theme.ts";

import { useOwnerName, usePace, useSettings, useT } from "#app/app-state.tsx";
import { BackgroundHint } from "#app/features/permissions/background-hint.tsx";
import { usePermissions } from "#app/features/permissions/use-permissions.ts";
import { SessionsSection } from "#app/features/sessions/sessions-section.tsx";
import { CategoryEstimates } from "#app/features/settings/category-estimates.tsx";
import { DangerZone } from "#app/features/settings/delete-account.tsx";
import { ExportRow } from "#app/features/settings/export-row.tsx";
import { KeyboardRow } from "#app/features/settings/keyboard-row.tsx";
import {
  DigestWindows,
  NotificationChannels,
  PushStatus,
  QuietHours,
} from "#app/features/settings/notification-settings.tsx";
import { ServerRow } from "#app/features/settings/server-row.tsx";
import { SettingsCell } from "#app/features/settings/settings-cell.tsx";
import { SettingsLinks } from "#app/features/settings/settings-links.tsx";
import { TimezoneRow } from "#app/features/settings/timezone-row.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { useOtaCoordinator } from "#app/platform/ota-provider.tsx";
import { DestinationScreen } from "#app/screens/destination-screen.tsx";
import { LogoutButton } from "#app/shared/logout-button.tsx";
import { OtaDetails } from "#app/shared/ota-status.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { cx } from "#app/ui/cx.ts";
import { KnownAfterSync } from "#app/ui/empty-state.tsx";
import { Group } from "#app/ui/group.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ListRow } from "#app/ui/list-row.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { Segmented } from "#app/ui/segmented.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { Text } from "#app/ui/text.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { LANGUAGES } from "@pace/core";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** A titled group of the inset grouped list; cells are its rows. */
const Section = ({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) => (
  <>
    <SectionHeader title={title} />
    <Group>{children}</Group>
  </>
);

/** "Permissions · 2 of 4 on", opening the screen with each one. */
const PermissionsRow = () => {
  const t = useT();
  const { list } = usePermissions();
  const on = (list ?? []).filter((permission) => permission.state === "on").length;
  return (
    <ListRow
      href="/permissions"
      title={t("settings.permissions")}
      trailing={
        list === null ? undefined : (
          <Text role="body" tone="secondary">
            {t("settings.permissions.summary", { on, total: list.length })}
          </Text>
        )
      }
    />
  );
};

const LanguageCell = () => {
  const t = useT();
  const settings = useSettings();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <SettingsCell label={t("settings.language")}>
      <Text role="body">{t("settings.language")}</Text>
      <KnownAfterSync>
        <Segmented
          label={t("settings.language")}
          onChange={(language) => {
            void run(actions.setLanguage(language));
          }}
          options={LANGUAGES.map((value) => ({ label: t(`settings.language.${value}`), value }))}
          value={settings.language}
        />
      </KnownAfterSync>
    </SettingsCell>
  );
};

/** Theme (this device) and Week's night hours (the account). */
const ThemeCell = () => {
  const t = useT();
  const theme = useTheme();
  return (
    <SettingsCell label={t("settings.theme")}>
      <Text role="body">{t("settings.theme")}</Text>
      <Segmented
        label={t("settings.theme")}
        onChange={theme.setPreference}
        options={THEME_PREFERENCES.map((value) => ({
          label: t(`settings.theme.${value}`),
          value,
        }))}
        value={theme.preference}
      />
    </SettingsCell>
  );
};

const NightHoursRow = () => {
  const t = useT();
  const settings = useSettings();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <KnownAfterSync>
      <SwitchRow
        // The hint says what the switch does now (QA round 25 R25-08), and that Week's moon is it.
        hint={t(settings.nightHours ? "settings.nightHours.hint" : "settings.nightHours.hintOff")}
        isOn={settings.nightHours}
        label={t("settings.nightHours")}
        onChange={(isOn) => {
          void run(actions.setNightHours(isOn));
        }}
      />
    </KnownAfterSync>
  );
};

/** A cell whose content waits for the account's first sync (the device's own settings do not). */
const AccountCell = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <SettingsCell label={label}>
    <Text role="body">{label}</Text>
    <KnownAfterSync>{children}</KnownAfterSync>
  </SettingsCell>
);

/** The running app bundle and a downloaded update; only where the native updater runs. */
const UpdatesSection = () => {
  const t = useT();
  const coordinator = useOtaCoordinator();
  return coordinator === null ? null : (
    <Section title={t("ota.title")}>
      <OtaDetails coordinator={coordinator} hasTitle={false} />
    </Section>
  );
};

export const SettingsScreen = () => {
  const t = useT();
  const owner = useOwnerName();
  const isWide = useIsWide();
  return (
    <DestinationScreen title={t("settings.title")}>
      <Section title={t("settings.account")}>
        <LanguageCell />
        <AccountCell label={t("settings.timezone")}>
          <TimezoneRow />
        </AccountCell>
      </Section>
      <Section title={t("settings.notifications")}>
        <SettingsCell label={t("settings.notifications")}>
          <KnownAfterSync>
            <NotificationChannels />
          </KnownAfterSync>
          <PushStatus />
          {/* Composed here: features do not import each other (dependency-cruiser). */}
          {IS_PHONE ? <BackgroundHint /> : null}
        </SettingsCell>
        <AccountCell label={t("settings.digestWindows")}>
          <DigestWindows />
        </AccountCell>
        <AccountCell label={t("settings.quietHours")}>
          <QuietHours />
        </AccountCell>
      </Section>
      <Section title={t("settings.tasks")}>
        <AccountCell label={t("settings.categoryEstimates")}>
          <CategoryEstimates />
        </AccountCell>
        <SettingsLinks />
      </Section>
      <Section title={t("sessions.title")}>
        <SettingsCell label={t("sessions.title")}>
          <SessionsSection />
        </SettingsCell>
      </Section>
      <Section title={t("settings.appearance")}>
        <ThemeCell />
        <NightHoursRow />
        <KeyboardRow />
      </Section>
      {IS_PHONE ? (
        <Section title={t("settings.permissions")}>
          <PermissionsRow />
        </Section>
      ) : null}
      {IS_PHONE ? (
        <Section title={t("settings.server")}>
          <ServerRow />
        </Section>
      ) : null}
      <UpdatesSection />
      {/* The account's own actions last: export (the web's download), log out, the danger zone. */}
      <View className="mx-gutter gap-3 py-6">
        {/* Bare text and loose buttons start at the section headers' text inset, not the
        groups' edge (design review 2 N6). */}
        <View className="gap-3 px-row-x">
          {owner === null ? null : (
            <Text role="footnote" tone="secondary">
              {t("nav.signedInAs", { name: owner })}
            </Text>
          )}
          <View className={cx("gap-3", isWide && "flex-row flex-wrap")}>
            {IS_PHONE ? null : <ExportRow />}
            <LogoutButton />
          </View>
        </View>
        <DangerZone />
      </View>
    </DestinationScreen>
  );
};
