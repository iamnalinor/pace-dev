import { Text, View } from "react-native";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

import { useRunAction } from "./use-run-action.ts";

/** The device sits in a zone with another offset than the account's: one tap moves the account. */
export const ZoneBanner = () => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const { timezone } = useSettings();
  const { deviceTz, now } = hooks.useClock();
  if (timezone === null || !zonesDiffer({ at: now, tz: deviceTz }, { at: now, tz: timezone })) {
    return null;
  }
  return (
    <View
      accessibilityRole="summary"
      className="mx-4 mb-3 gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3"
    >
      <Text className="font-sans text-[13px] leading-[18px] text-fg2">
        {t("zone.banner", { account: timezone, device: deviceTz })}
      </Text>
      <Button
        onPress={() => {
          void run(actions.setTimezone(deviceTz));
        }}
        variant="secondary"
      >
        {t("zone.use", { device: deviceTz })}
      </Button>
    </View>
  );
};
