import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useGrants } from "@pace/client/react";

import { GrantRow } from "./grant-row.tsx";

/** The MCP clients holding a grant on this account, each with a confirmed revoke. */
export const ConnectedApps = () => {
  const t = useT();
  const { api } = usePace();
  const { hasRevokeFailed, phase, revoke } = useGrants(api);
  return (
    <View className="gap-3">
      <Text className="font-sans text-[13px] text-muted">{t("connectedApps.hint")}</Text>
      {phase.kind === "loading" ? (
        <Text className="font-sans text-[14px] text-muted">{t("connectedApps.loading")}</Text>
      ) : null}
      {phase.kind === "failed" ? (
        <Text className="font-sans text-[14px] text-warn">{t("connectedApps.failed")}</Text>
      ) : null}
      {phase.kind === "ready" && phase.grants.length === 0 ? (
        <Text className="font-sans text-[14px] text-muted">{t("connectedApps.empty")}</Text>
      ) : null}
      {phase.kind === "ready"
        ? phase.grants.map((grant) => (
            <GrantRow
              grant={grant}
              key={grant.id}
              onRevoke={() => {
                void revoke(grant);
              }}
            />
          ))
        : null}
      {hasRevokeFailed ? (
        <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
          {t("connectedApps.revokeFailed")}
        </Text>
      ) : null}
    </View>
  );
};
