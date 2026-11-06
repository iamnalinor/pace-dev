import { Text, View } from "react-native";
import { useStore } from "zustand";

import type { OtaCoordinator } from "#app/platform/ota-coordinator.ts";

import { useT } from "#app/app-state.tsx";
import { useOtaCoordinator } from "#app/platform/ota-provider.tsx";
import { Button } from "#app/ui/button.tsx";

/** Identifiers describe the running bundle; a ready bundle is applied only on deliberate restart. */
export const OtaDetails = ({ coordinator }: { readonly coordinator: OtaCoordinator }) => {
  const t = useT();
  const state = useStore(coordinator.store);
  const { diagnostics } = state;
  return (
    <View className="gap-2 border-b border-separator px-5 py-4">
      <Text accessibilityRole="header" className="font-sans text-callout text-label-primary">
        {t("ota.title")}
      </Text>
      <Text className="font-sans text-footnote text-label-secondary" role="status">
        {t(`ota.status.${state.status}`)}
      </Text>
      {state.error === null ? null : (
        <Text className="font-sans text-footnote text-label-secondary">
          {t(`ota.error.${state.error}`)}
        </Text>
      )}
      {diagnostics.isEmergencyLaunch ? (
        <Text className="font-sans text-footnote text-label-secondary">{t("ota.recovered")}</Text>
      ) : null}
      <Text className="font-sans text-footnote text-label-secondary" selectable>
        {t("ota.apk", { value: diagnostics.apkVersion ?? t("ota.unknown") })}
      </Text>
      <Text className="font-sans text-footnote text-label-secondary" selectable>
        {t("ota.runtime", { value: diagnostics.runtimeVersion ?? t("ota.unknown") })}
      </Text>
      <Text className="font-sans text-footnote text-label-secondary" selectable>
        {t("ota.update", {
          value: diagnostics.isEmbeddedLaunch
            ? t("ota.embedded")
            : (diagnostics.updateId ?? t("ota.unknown")),
        })}
      </Text>
      {diagnostics.createdAt === null ? null : (
        <Text className="font-sans text-footnote text-label-secondary" selectable>
          {t("ota.date", { value: diagnostics.createdAt })}
        </Text>
      )}
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
