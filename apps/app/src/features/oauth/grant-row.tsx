import { useState } from "react";
import { Text, View } from "react-native";

import { useLanguage, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { SCOPE_KEYS } from "@pace/client";
import { type OAuthGrant, type OAuthScope, OAuthScopeSchema } from "@pace/core";

const isKnownScope = (scope: string): scope is OAuthScope =>
  OAuthScopeSchema.safeParse(scope).success;

/** One grant: the client (its own name, rendered as text), what it may do, and a two-step revoke. */
export const GrantRow = ({
  grant,
  onRevoke,
}: {
  readonly grant: OAuthGrant;
  readonly onRevoke: () => void;
}) => {
  const t = useT();
  const language = useLanguage();
  const [isConfirming, setIsConfirming] = useState(false);
  const connectedOn = new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
    new Date(grant.createdAt),
  );
  return (
    <View className="gap-2 rounded-lg border border-line bg-raised p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-[14px] font-medium text-fg" numberOfLines={1}>
            {grant.clientName}
          </Text>
          <Text className="font-sans text-[12px] text-muted">
            {t("connectedApps.connected", { date: connectedOn })}
          </Text>
        </View>
        {isConfirming ? null : (
          <Button
            onPress={() => {
              setIsConfirming(true);
            }}
            variant="secondary"
          >
            {t("connectedApps.revoke")}
          </Button>
        )}
      </View>
      <View className="gap-0.5">
        {grant.scopes.map((scope) => (
          <Text className="font-sans text-[12px] text-fg2" key={scope}>
            {isKnownScope(scope) ? t(SCOPE_KEYS[scope]) : scope}
          </Text>
        ))}
      </View>
      {isConfirming ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="flex-1 font-sans text-[14px] text-fg">
            {t("connectedApps.revokeConfirm", { name: grant.clientName })}
          </Text>
          <Button
            onPress={() => {
              setIsConfirming(false);
            }}
            variant="ghost"
          >
            {t("common.cancel")}
          </Button>
          <Button onPress={onRevoke}>{t("connectedApps.revokeYes")}</Button>
        </View>
      ) : null}
    </View>
  );
};
