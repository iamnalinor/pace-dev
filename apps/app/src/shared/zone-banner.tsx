import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

import { useRunAction } from "./use-run-action.ts";

/** The pair of zones this device was told to keep as they are ("UTC|Europe/Moscow"). */
const KEPT_KEY = "pace.zoneKept";

const pairOf = (device: string, account: string): string => `${device}|${account}`;

/**
Which pair of zones the person chose to keep on this device; `undefined` while it is read. A trip
on purpose leaves the account's zone alone without the card on every visit (QA round 17 L10);
another device zone or another account zone asks again.
*/
const useKeptPair = (): readonly [null | string | undefined, (pair: string) => void] => {
  const [kept, setKept] = useState<null | string | undefined>(undefined);
  useEffect(() => {
    const lifetime = new AbortController();
    void (async () => {
      let stored: null | string = null;
      try {
        stored = await SecureStore.getItemAsync(KEPT_KEY);
      } catch {
        // Unreadable storage: the card asks again.
      }
      if (!lifetime.signal.aborted) {
        setKept(stored);
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, []);
  const keep = (pair: string): void => {
    setKept(pair);
    void (async () => {
      try {
        await SecureStore.setItemAsync(KEPT_KEY, pair);
      } catch {
        // Kept for this visit only.
      }
    })();
  };
  return [kept, keep];
};

/**
The device sits in a zone with another offset than the account's: one tap moves the account, the
other keeps it (and the card stays away until either zone changes).
*/
export const ZoneBanner = () => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const { timezone } = useSettings();
  const { deviceTz, now } = hooks.useClock();
  const [kept, keep] = useKeptPair();
  if (
    timezone === null ||
    kept === undefined ||
    kept === pairOf(deviceTz, timezone) ||
    !zonesDiffer({ at: now, tz: deviceTz }, { at: now, tz: timezone })
  ) {
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
      <View className="flex-row flex-wrap gap-2">
        <Button
          onPress={() => {
            void run(actions.setTimezone(deviceTz));
          }}
          variant="secondary"
        >
          {t("zone.use", { device: deviceTz })}
        </Button>
        <Button
          onPress={() => {
            keep(pairOf(deviceTz, timezone));
          }}
          variant="ghost"
        >
          {t("zone.keep", { account: timezone })}
        </Button>
      </View>
    </View>
  );
};
