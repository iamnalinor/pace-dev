import { useCallback, useEffect, useState } from "react";

import { useT } from "#app/app-state.tsx";
import {
  removeSeriesRule,
  type SeriesRule,
  seriesRules,
  usePhoneMemoryVersion,
} from "#app/platform/phone-memory.ts";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { Button } from "#app/ui/button.tsx";
import { Group } from "#app/ui/group.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { Text } from "#app/ui/text.tsx";

import { PermissionCard } from "./permission-card.tsx";
import { usePermissions } from "./use-permissions.ts";

/** The calendar series answered "every time" on Day, each one can be forgotten. */
const SeriesRules = () => {
  const t = useT();
  const [rules, setRules] = useState<readonly SeriesRule[]>([]);
  // Read again whenever Day remembers or this list forgets one, while the screen is open.
  const memory = usePhoneMemoryVersion();
  const reload = useCallback(() => {
    void (async () => {
      setRules(await seriesRules());
    })();
  }, []);
  useEffect(() => {
    reload();
  }, [reload, memory]);
  if (rules.length === 0) {
    return null;
  }
  return (
    <>
      <SectionHeader title={t("permissions.rules")} />
      <Group>
        {rules.map((rule) => (
          <ListRow
            key={rule.series}
            title={t(`permissions.rule.${rule.rule}`, { title: rule.title })}
            trailing={
              <Button
                onPress={() => {
                  void (async () => {
                    await removeSeriesRule(rule.series);
                    reload();
                  })();
                }}
                variant="plain"
              >
                {t("permissions.rule.remove")}
              </Button>
            }
          />
        ))}
      </Group>
    </>
  );
};

/** Settings → Permissions: every permission Pace may use, why, and a way to turn it on. */
export const PermissionsScreen = () => {
  const t = useT();
  const { list, request } = usePermissions();
  return (
    <PushedScreen title={t("permissions.title")}>
      <Text className="px-gutter pb-3" role="footnote" tone="secondary">
        {t("permissions.hint")}
      </Text>
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
