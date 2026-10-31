import { useState } from "react";
import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useSessions } from "@pace/client/react";

import { GrantRow } from "./grant-row.tsx";

/** The MCP clients holding a grant on this account, each with a confirmed revoke. */
export const ConnectedApps = () => {
  const t = useT();
  const { api } = usePace();
  const { revoke, sessions, status } = useSessions(api);
  const [hasRevokeFailed, setHasRevokeFailed] = useState(false);
  const grants = sessions.filter((session) => session.kind === "mcp");
  return (
    <View className="gap-3">
      <Text className="font-sans text-[13px] text-muted">{t("connectedApps.hint")}</Text>
      {status === "loading" ? (
        <Text className="font-sans text-[14px] text-muted">{t("connectedApps.loading")}</Text>
      ) : null}
      {status === "error" ? (
        <Text className="font-sans text-[14px] text-warn">{t("connectedApps.failed")}</Text>
      ) : null}
      {status === "ready" && grants.length === 0 ? (
        <Text className="font-sans text-[14px] text-muted">{t("connectedApps.empty")}</Text>
      ) : null}
      {grants.map((grant) => (
        <GrantRow
          grant={grant}
          key={grant.id}
          onRevoke={() => {
            void (async () => {
              try {
                await revoke(grant.id);
                setHasRevokeFailed(false);
              } catch {
                setHasRevokeFailed(true);
              }
            })();
          }}
        />
      ))}
      {hasRevokeFailed ? (
        <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
          {t("connectedApps.revokeFailed")}
        </Text>
      ) : null}
    </View>
  );
};
