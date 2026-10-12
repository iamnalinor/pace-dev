import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { loadDeviceId } from "#app/platform/device-id.ts";
import { IS_PHONE } from "#app/platform/device.ts";
import { isCalendarSyncOn, setCalendarSync } from "#app/platform/phone-memory.ts";
import { uploadPhoneData } from "#app/platform/phone-upload.ts";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { Button } from "#app/ui/button.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { useDevices } from "@pace/client/react";
import { endpoints } from "@pace/core";

import { AddComputer } from "./add-computer.tsx";
import { DeviceRow } from "./device-row.tsx";

/** On a phone: whether its calendar goes to Pace; off deletes the copy there. */
const CalendarSyncRow = () => {
  const t = useT();
  const { api, clock } = usePace();
  const [isOn, setIsOn] = useState(true);
  useEffect(() => {
    void (async () => {
      setIsOn(await isCalendarSyncOn());
    })();
  }, []);
  const change = async (isWanted: boolean): Promise<void> => {
    setIsOn(isWanted);
    await setCalendarSync(isWanted);
    if (isWanted) {
      await uploadPhoneData(api, clock.now());
      return;
    }
    try {
      await api.call(endpoints.calendar.clear, { query: { deviceId: await loadDeviceId() } });
    } catch {
      // Offline: the copy stays until the next time it is turned off; nothing new is sent.
    }
  };
  return (
    <SwitchRow
      hint={t("devices.calendarHint")}
      isOn={isOn}
      label={t("devices.calendar")}
      onChange={(isWanted) => void change(isWanted)}
    />
  );
};

/**
Settings → Devices: everything that sends Pace the apps in front, with when it last did;
adding a computer (a token and one install command) and disconnecting one.
*/
export const DevicesScreen = () => {
  const t = useT();
  const { api } = usePace();
  const { create, phase, revoke } = useDevices(api);
  const [isAdding, setIsAdding] = useState(false);
  const [hasRevokeFailed, setHasRevokeFailed] = useState(false);
  return (
    <PushedScreen title={t("devices.title")}>
      <View className="gap-3 px-5 py-4">
        <Text className="font-sans text-[13px] leading-[18px] text-muted">{t("devices.hint")}</Text>
        {IS_PHONE ? <CalendarSyncRow /> : null}
        {phase.kind === "loading" ? (
          <Text className="font-sans text-[14px] text-muted">{t("devices.loading")}</Text>
        ) : null}
        {phase.kind === "failed" ? (
          <Text className="font-sans text-[14px] text-warn">{t("devices.failed")}</Text>
        ) : null}
        {phase.kind === "ready" && phase.devices.length === 0 ? (
          <Text className="font-sans text-[14px] text-muted">{t("devices.empty")}</Text>
        ) : null}
        {phase.kind === "ready"
          ? phase.devices.map((device) => (
              <DeviceRow
                device={device}
                key={device.id}
                onDisconnect={() => {
                  void (async () => {
                    setHasRevokeFailed(!(await revoke(device.id)));
                  })();
                }}
              />
            ))
          : null}
        {hasRevokeFailed ? (
          <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
            {t("devices.disconnectFailed")}
          </Text>
        ) : null}
        <Button
          onPress={() => {
            setIsAdding(true);
          }}
        >
          {t("devices.add")}
        </Button>
      </View>
      {isAdding ? (
        <AddComputer
          create={create}
          onClose={() => {
            setIsAdding(false);
          }}
        />
      ) : null}
    </PushedScreen>
  );
};
