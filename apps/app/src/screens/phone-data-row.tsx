import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Text, View } from "react-native";

import { useT } from "../app-state.tsx";
import {
  calendarAccess,
  type CalendarAccess,
  requestCalendarAccess,
} from "../platform/phone-calendar.ts";
import { hasUsageAccess, openUsageAccessSettings } from "../platform/phone-data.ts";
import { Button } from "../ui/button.tsx";

const Access = ({
  action,
  isOn,
  label,
  onAction,
}: {
  readonly label: string;
  readonly isOn: boolean;
  readonly action: string;
  readonly onAction: () => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <Text className="font-sans text-[14px] text-fg">{label}</Text>
        <Text
          className={
            isOn ? "font-sans text-[12px] text-ink-green" : "font-sans text-[12px] text-muted"
          }
        >
          {t(isOn ? "settings.phone.on" : "settings.phone.off")}
        </Text>
      </View>
      {isOn ? null : (
        <Button onPress={onAction} variant="secondary">
          {action}
        </Button>
      )}
    </View>
  );
};

/** Usage access and calendar access: what each one is for, whether it is on, how to turn it on. */
export const PhoneDataRow = () => {
  const t = useT();
  const [usage, setUsage] = useState(() => hasUsageAccess());
  const [calendar, setCalendar] = useState<CalendarAccess>("undetermined");
  const refreshCalendar = useCallback(() => {
    void (async () => {
      setCalendar(await calendarAccess());
    })();
  }, []);
  useEffect(() => {
    refreshCalendar();
    // Both are granted in Android settings: look again when the person comes back.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        return;
      }

      setUsage(hasUsageAccess());
      refreshCalendar();
    });
    return () => {
      subscription.remove();
    };
  }, [refreshCalendar]);
  return (
    <View className="gap-3 border-b border-line px-5 py-4">
      <Text className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {t("settings.phone")}
      </Text>
      <Text className="font-sans text-[13px] text-muted">{t("settings.phone.hint")}</Text>
      <Access
        action={t("settings.phone.open")}
        isOn={usage}
        label={t("settings.phone.usage")}
        onAction={openUsageAccessSettings}
      />
      <Access
        action={t(calendar === "denied" ? "settings.phone.open" : "settings.phone.allow")}
        isOn={calendar === "granted"}
        label={t("settings.phone.calendar")}
        onAction={() => {
          // Once refused, Android stops asking: only the app's settings page can turn it back on.
          if (calendar === "denied") {
            void Linking.openSettings();
            return;
          }
          void (async () => {
            setCalendar(await requestCalendarAccess());
          })();
        }}
      />
    </View>
  );
};
