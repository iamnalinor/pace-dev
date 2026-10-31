import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { Session } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { isCalendarSyncOn, setCalendarSync } from "#app/platform/phone-memory.ts";
import { clearPhoneCalendar, uploadPhoneData } from "#app/platform/phone-upload.ts";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { Button } from "#app/ui/button.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { useSessions } from "@pace/client/react";

import { AddComputer } from "./add-computer.tsx";
import { DeviceRow, type ListedDevice } from "./device-row.tsx";

/** The phones and computers among the sessions, the most recent data first. */
const devicesOf = (sessions: readonly Session[]): readonly ListedDevice[] =>
  sessions
    .filter((session) => session.kind === "agent" || session.kind === "app")
    .map((session) => ({
      connectedAt: session.kind === "agent" ? session.createdAt : null,
      id: session.id,
      kind: session.kind === "agent" ? ("computer" as const) : ("phone" as const),
      lastActivityAt: session.lastDataAt,
      name: session.name,
    }))
    .toSorted((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));

/** On a phone: whether its calendar goes to Pace; off deletes the copy there. */
const CalendarSyncRow = () => {
  const t = useT();
  const { api, clock } = usePace();
  const [isOn, setIsOn] = useState(false);
  useEffect(() => {
    void (async () => {
      const session = api.currentSessionToken();
      if (session === undefined) {
        return;
      }
      const isSaved = await isCalendarSyncOn(session);
      if (api.isCurrentSession(session)) {
        setIsOn(isSaved);
      }
    })();
  }, [api]);
  const change = async (isWanted: boolean): Promise<void> => {
    const session = api.currentSessionToken();
    if (session === undefined) {
      return;
    }
    setIsOn(isWanted);
    await setCalendarSync(session, isWanted, () => api.isCurrentSession(session));
    if (!api.isCurrentSession(session)) {
      return;
    }
    if (isWanted) {
      await uploadPhoneData(api, clock.now());
      return;
    }
    try {
      await clearPhoneCalendar(api, session);
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
  const { createAgent, revoke, sessions, status } = useSessions(api);
  const devices = devicesOf(sessions);
  const [isAdding, setIsAdding] = useState(false);
  const [hasRevokeFailed, setHasRevokeFailed] = useState(false);
  return (
    <PushedScreen title={t("devices.title")}>
      <View className="gap-3 px-5 py-4">
        <Text className="font-sans text-[13px] leading-[18px] text-muted">{t("devices.hint")}</Text>
        {IS_PHONE ? <CalendarSyncRow /> : null}
        {status === "loading" ? (
          <Text className="font-sans text-[14px] text-muted">{t("devices.loading")}</Text>
        ) : null}
        {status === "error" ? (
          <Text className="font-sans text-[14px] text-warn">{t("devices.failed")}</Text>
        ) : null}
        {status === "ready" && devices.length === 0 ? (
          <Text className="font-sans text-[14px] text-muted">{t("devices.empty")}</Text>
        ) : null}
        {devices.map((device) => (
          <DeviceRow
            device={device}
            key={device.id}
            onDisconnect={() => {
              void (async () => {
                try {
                  await revoke(device.id);
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
          create={createAgent}
          onClose={() => {
            setIsAdding(false);
          }}
        />
      ) : null}
    </PushedScreen>
  );
};
