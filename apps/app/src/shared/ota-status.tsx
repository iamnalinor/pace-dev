import { View } from "react-native";
import { useStore } from "zustand";

import type { OtaCoordinator } from "#app/platform/ota-coordinator.ts";

import { useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useOtaCoordinator } from "#app/platform/ota-provider.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Text } from "#app/ui/text.tsx";

/** One line of the running bundle's identifiers, selectable so it can be copied into a report. */
const Detail = ({ children }: { readonly children: string }) => (
  <Text role="footnote" selectable tone="secondary">
    {children}
  </Text>
);

type Diagnostics = ReturnType<OtaCoordinator["store"]["getState"]>["diagnostics"];

/**
Which APK, runtime and update are running, and when that update was made (in the device's zone).
A build that updates through APKs has no runtime or update of its own: only its APK version.
*/
const BundleIdentifiers = ({
  diagnostics,
  isEnabled,
}: {
  readonly diagnostics: Diagnostics;
  readonly isEnabled: boolean;
}) => {
  const t = useT();
  const viewer = useViewer();
  const unknown = t("ota.unknown");
  const apk = <Detail>{t("ota.apk", { value: diagnostics.apkVersion ?? unknown })}</Detail>;
  if (!isEnabled) {
    return apk;
  }
  return (
    <>
      {apk}
      <Detail>{t("ota.runtime", { value: diagnostics.runtimeVersion ?? unknown })}</Detail>
      <Detail>
        {t("ota.update", {
          value: diagnostics.isEmbeddedLaunch
            ? t("ota.embedded")
            : (diagnostics.updateId ?? unknown),
        })}
      </Detail>
      {diagnostics.createdAt === null ? null : (
        <Detail>
          {t("ota.date", {
            value: zonedText(
              { at: diagnostics.createdAt, mode: "datetime", tz: viewer.deviceTz },
              viewer,
            ),
          })}
        </Detail>
      )}
    </>
  );
};

/** Identifiers describe the running bundle; a ready bundle is applied only on deliberate restart. */
export const OtaDetails = ({
  coordinator,
  hasTitle = true,
}: {
  readonly coordinator: OtaCoordinator;
  /** Off where a section header above already names it (Settings). */
  readonly hasTitle?: boolean;
}) => {
  const t = useT();
  const state = useStore(coordinator.store);
  const { diagnostics } = state;
  return (
    <View className="gap-2 px-row-x py-3">
      {hasTitle ? (
        <Text level={2} role="headline">
          {t("ota.title")}
        </Text>
      ) : null}
      <Text accessibilityLiveRegion="polite" role="footnote">
        {t(`ota.status.${state.status}`)}
      </Text>
      {state.error === null ? null : (
        <Text role="footnote" tone="secondary">
          {t(`ota.error.${state.error}`)}
        </Text>
      )}
      {diagnostics.isEmergencyLaunch ? (
        <Text role="footnote" tone="secondary">
          {t("ota.recovered")}
        </Text>
      ) : null}
      <BundleIdentifiers diagnostics={diagnostics} isEnabled={state.status !== "disabled"} />
      {state.ready === null ? null : (
        <Button
          disabled={state.status === "restarting"}
          onPress={() => {
            void coordinator.restart();
          }}
          variant="secondary"
        >
          {t(state.ready.kind === "rollback" ? "ota.restart.rollback" : "ota.restart")}
        </Button>
      )}
    </View>
  );
};

/** The native app provider owns the controller; the web keeps its service-worker UI. */
export const OtaStatus = () => {
  const coordinator = useOtaCoordinator();
  return coordinator === null ? null : <OtaDetails coordinator={coordinator} />;
};
