import { Text, View } from "react-native";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

/** The zone this device reports; the account zone defaults to it on first login. */
export const deviceTimeZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
The account zone with the device zone beside it. Another name for the same offset is not
worth a warning, but the device zone stays one tap away whenever the names differ.
*/
export const TimezoneRow = () => {
  const t = useT();
  const { actions, hooks } = usePace();
  const { now } = hooks.useClock();
  const device = deviceTimeZone();
  // Until the first sync assigns one, the account runs on the device zone (queries do too).
  const account = useSettings().timezone ?? device;
  const isOffsetDifferent = zonesDiffer({ at: now, tz: account }, { at: now, tz: device });
  return (
    <View className="gap-2">
      <Text className="font-sans text-[14px] tabular-nums text-fg">
        {t("settings.timezone.account", { tz: account })}
      </Text>
      {account === device ? null : (
        <Text className="font-sans text-[13px] text-muted">
          {t("settings.timezone.device", { tz: device })}
        </Text>
      )}
      {isOffsetDifferent ? (
        <Text className="font-sans text-[13px] text-warn">{t("settings.timezone.differs")}</Text>
      ) : null}
      {account === device ? null : (
        <Button
          onPress={() => {
            void actions.setTimezone(device);
          }}
          variant="secondary"
        >
          {t("settings.timezone.use", { tz: device })}
        </Button>
      )}
    </View>
  );
};
