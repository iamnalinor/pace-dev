import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { removeSeriesRule, type SeriesRule, seriesRules } from "#app/platform/phone-memory.ts";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { Button } from "#app/ui/button.tsx";

import { PermissionCard } from "./permission-card.tsx";
import { usePermissions } from "./use-permissions.ts";

/** The calendar series answered "every time" on Day, each one can be forgotten. */
const SeriesRules = () => {
  const t = useT();
  const [rules, setRules] = useState<readonly SeriesRule[]>([]);
  const reload = useCallback(() => {
    void (async () => {
      setRules(await seriesRules());
    })();
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  if (rules.length === 0) {
    return null;
  }
  return (
    <View
      accessibilityLabel={t("permissions.rules")}
      className="gap-1 border-t border-line px-5 py-4"
    >
      <Text className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {t("permissions.rules")}
      </Text>
      {rules.map((rule) => (
        <View className="flex-row items-center gap-3" key={rule.series}>
          <Text className="flex-1 font-sans text-[14px] text-fg">
            {t(`permissions.rule.${rule.rule}`, { title: rule.title })}
          </Text>
          <Button
            onPress={() => {
              void (async () => {
                await removeSeriesRule(rule.series);
                reload();
              })();
            }}
            variant="ghost"
          >
            {t("permissions.rule.remove")}
          </Button>
        </View>
      ))}
    </View>
  );
};

/** Settings → Permissions: every permission Pace may use, why, and a way to turn it on. */
export const PermissionsScreen = () => {
  const t = useT();
  const { list, request } = usePermissions();
  return (
    <PushedScreen title={t("permissions.title")}>
      <Text className="px-5 pb-3 font-sans text-[13px] text-muted">{t("permissions.hint")}</Text>
      {(list ?? []).map((permission) => (
        <PermissionCard
          key={permission.id}
          onRequest={(chosen) => {
            void request(chosen);
          }}
          permission={permission}
        />
      ))}
      <SeriesRules />
    </PushedScreen>
  );
};
