import { X } from "lucide-react-native";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useStore } from "zustand";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import {
  loadOfferedMethods,
  loadPushState,
  type PushMethod,
  type PushState,
  pushStore,
  registerPush,
  setPushChoice,
} from "#app/platform/notifications.ts";
import { Button } from "#app/ui/button.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Segmented } from "#app/ui/segmented.tsx";
import { PaceSwitch } from "#app/ui/switch-row.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";
import { isChannelOn, NOTIFICATION_CHANNELS, NOTIFICATION_KINDS } from "@pace/core";

/**
Where each kind of notification goes: a row per kind, a switch per channel (Telegram, the app,
the web). The switches read the one rule the server and the feed read (`isChannelOn`).
*/
export const NotificationChannels = () => {
  const t = useT();
  const { actions } = usePace();
  const settings = useSettings();
  return (
    <View className="gap-1" role="table">
      <Text className="font-sans text-footnote text-label-secondary">
        {t("settings.notifications.hint")}
      </Text>
      <View className="flex-row items-center gap-2 pt-1" role="row">
        <View className="flex-1" />
        {NOTIFICATION_CHANNELS.map((channel) => (
          <Text
            className="w-row text-center font-sans text-caption2 font-normal text-label-tertiary"
            key={channel}
            role="columnheader"
          >
            {t(`notify.channel.${channel}`)}
          </Text>
        ))}
      </View>
      {NOTIFICATION_KINDS.map((kind) => (
        <View className="min-h-hit-web flex-row items-center gap-2" key={kind} role="row">
          <Text
            className="min-w-0 flex-1 font-sans text-subhead font-normal text-label-primary"
            role="rowheader"
          >
            {t(`notify.kind.${kind}`)}
          </Text>
          {NOTIFICATION_CHANNELS.map((channel) => (
            <View className="w-row items-center" key={channel} role="cell">
              <PaceSwitch
                isOn={isChannelOn(settings, kind, channel)}
                label={t("notify.switch", {
                  channel: t(`notify.channel.${channel}`),
                  kind: t(`notify.kind.${kind}`),
                })}
                onChange={(isOn) => {
                  void actions.setNotificationChannel(kind, channel, isOn);
                }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

/** What the picker offers: automatic, then a way through the server, then Off. */
type PushOption = "auto" | PushMethod;

/**
The methods to pick from: what the server takes (asked again when Settings opens, and on every
registration, so a change while open shows); before it ever answered (offline), the method in
use and the one picked, so the current pick stays shown and selected.
*/
const offeredMethods = ({
  choice,
  method,
  offered,
}: Pick<PushState, "choice" | "method" | "offered">): readonly ("fcm" | "poll")[] =>
  offered ?? (["fcm", "poll"] as const).filter((option) => option === choice || option === method);

/** Reads the stored push state and asks the server's methods when Settings opens. */
const useLoadPushState = (): void => {
  const { api } = usePace();
  useEffect(() => {
    void (async () => {
      await loadPushState();
      await loadOfferedMethods(api);
    })();
  }, [api]);
};

/** What the phone uses now, and why when it is not what was picked. */
const pushLine = (
  {
    choice,
    isAllowed,
    method,
  }: {
    readonly choice: null | PushMethod;
    readonly isAllowed: boolean;
    readonly method: PushMethod;
  },
  t: ReturnType<typeof useT>,
): readonly string[] => {
  if (!isAllowed) {
    return [t("settings.push.denied")];
  }
  const fellBack =
    choice !== null && choice !== method
      ? [t("settings.push.unavailable", { method: t(`settings.push.option.${choice}`) })]
      : [];
  return [...fellBack, t(`settings.push.${method}`)];
};

/**
In a browser: one line on how the web gets notifications (the bell). On a phone: how system notifications reach it, picked from what the server takes now (Google's
push, Pace's own check) or Off, or left automatic (the default, and a way back after a pick). It
follows every change (`pushStore`): a pick, a start that registered again, the server's methods
changing (the live notice registers again).
*/
export const PushStatus = () => {
  const t = useT();
  const { api } = usePace();
  useLoadPushState();
  const state = useStore(pushStore);
  if (!IS_PHONE) {
    // A browser has no method to pick: say what its Web column means (QA round 15 L12).
    return (
      <Text className="font-sans text-footnote text-label-secondary">{t("settings.push.web")}</Text>
    );
  }
  const values: readonly PushOption[] = ["auto", ...offeredMethods(state), "none"];
  const options = values.map((value) => ({ label: t(`settings.push.option.${value}`), value }));
  const pick = (option: PushOption): void => {
    void (async () => {
      try {
        await setPushChoice(option === "auto" ? null : option);
      } catch {
        // The phone did not keep it: the radio is back on the previous pick, nothing to register.
        return;
      }
      try {
        await registerPush(api);
      } catch {
        // Offline: the pick is kept and registered on the next start.
      }
    })();
  };
  return (
    <View className="gap-2">
      <Text className="font-sans text-footnote text-label-secondary">
        {t("settings.push.hint")}
      </Text>
      <Segmented onChange={pick} options={options} value={state.choice ?? "auto"} />
      {state.isFcmOtherProject ? (
        <Text className="font-sans text-footnote text-label-secondary">
          {t("settings.push.otherProject")}
        </Text>
      ) : null}
      {state.method === null
        ? null
        : pushLine({ ...state, method: state.method }, t).map((line) => (
            <Text className="font-sans text-footnote text-label-secondary" key={line}>
              {line}
            </Text>
          ))}
    </View>
  );
};

/** The daily digest times (`HH:MM` on the account's zone); every change is saved at once. */
export const DigestWindows = () => {
  const t = useT();
  const { actions } = usePace();
  const { digestWindows } = useSettings();
  const save = (next: readonly string[]): void => {
    void actions.setDigestWindows(next);
  };
  return (
    <View className="gap-2">
      <Text className="font-sans text-footnote text-label-secondary">
        {t("settings.digestWindows.hint")}
      </Text>
      {digestWindows.map((time, index) => (
        // The row is its position: keyed by value, editing a time would remount the input.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
        <View className="flex-row items-center gap-2" key={index}>
          <TimeInput
            className="flex-1"
            label={t("settings.digestWindows.time", { index: index + 1 })}
            onTime={(next) => {
              save(digestWindows.with(index, next));
            }}
            value={time}
          />
          <IconButton
            icon={X}
            label={t("settings.digestWindows.remove", { time })}
            onPress={() => {
              save(digestWindows.filter((_, position) => position !== index));
            }}
            variant="plain"
          />
        </View>
      ))}
      <Button
        onPress={() => {
          save([...digestWindows, "12:00"]);
        }}
        variant="secondary"
      >
        {t("settings.digestWindows.add")}
      </Button>
    </View>
  );
};

/** The nightly window without notifications; each edge is saved as soon as it is a time. */
export const QuietHours = () => {
  const t = useT();
  const { actions } = usePace();
  const { quietHours } = useSettings();
  const edge = (side: "from" | "to") => (
    <View className="flex-1 gap-2">
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t(`settings.quietHours.${side}`)}
      </Text>
      <TimeInput
        label={t(`settings.quietHours.${side}`)}
        onTime={(time) => {
          void actions.setQuietHours({ ...quietHours, [side]: time });
        }}
        value={quietHours[side]}
      />
    </View>
  );
  return (
    <View className="gap-2">
      <Text className="font-sans text-footnote text-label-secondary">
        {t("settings.quietHours.hint")}
      </Text>
      <View className="flex-row gap-3">
        {edge("from")}
        {edge("to")}
      </View>
    </View>
  );
};
