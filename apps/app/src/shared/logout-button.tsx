import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useAuth, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { cx } from "#app/ui/cx.ts";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { plural } from "@pace/core";

type Subscribable = { readonly subscribe: (listener: () => void) => () => void };

/** The outbox's size, read again whenever the local log or the sync changes. */
const useUnsyncedCount = (
  read: () => Promise<number>,
  log: Subscribable,
  status: Subscribable,
): number => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    const refresh = (): void => {
      void (async () => {
        const next = await read();
        if (isCurrent) {
          setCount(next);
        }
      })();
    };
    refresh();
    const stopLog = log.subscribe(refresh);
    const stopStatus = status.subscribe(refresh);
    return () => {
      isCurrent = false;
      stopLog();
      stopStatus();
    };
  }, [read, log, status]);
  return count;
};

/**
Log out, which takes the local copy with it: when the outbox still holds changes the server has
not acknowledged (offline, a server down), it asks first, naming how many, with Wait (which sends
them now) or Log out anyway (QA round 23 R23-02). With nothing unsent it logs out at once. Log out
stays reachable either way. Focus moves to Wait with the question said, and back to Log out on
Wait (bug class 5).
*/
export const LogoutButton = () => {
  const t = useT();
  const language = useLanguage();
  const isWide = useIsWide();
  const router = useRouter();
  const { auth } = useAuth();
  const { state, sync, unsyncedCount } = usePace();
  const focus = useConfirmFocus();
  const [unsynced, setUnsynced] = useState(0);
  const known = useUnsyncedCount(unsyncedCount, state.store, sync.status);
  const logout = async (): Promise<void> => {
    await auth.logout();
    router.replace("/login");
  };
  // Read ahead, so a press with nothing unsent logs out at once, with no wait before it: a pause
  // there let a sync run start with the token the log-out then ends (the stale-tab e2e).
  const ask = (): void => {
    if (known === 0) {
      void logout();
      return;
    }
    focus.toCancel();
    setUnsynced(known);
  };
  if (unsynced === 0) {
    return (
      <Button onPress={ask} ref={focus.openerRef()} variant="secondary">
        {t("settings.logout")}
      </Button>
    );
  }
  const question = plural(language, unsynced, {
    few: t("settings.logout.unsynced.few"),
    many: t("settings.logout.unsynced.many"),
    one: t("settings.logout.unsynced.one"),
    other: t("settings.logout.unsynced.other"),
  });
  // On a computer, a card on a line of its own, as the app's other inline confirms (Delete preset,
  // Wipe data): beside Export its buttons sat 500 px from the question. On a phone the row is a
  // column already, and a card's padding would wrap «Всё равно выйти» onto two lines at 390 px.
  return (
    <View
      aria-label={question}
      className={cx(
        "w-full",
        isWide ? "gap-3 rounded-xl border border-separator bg-cell p-4" : "gap-2",
      )}
      role="group"
    >
      <Text
        accessibilityLiveRegion="polite"
        className="font-sans text-subhead font-normal text-label-primary"
        role="status"
      >
        {question}
      </Text>
      <View className={cx("flex-row gap-2", isWide && "justify-end")}>
        <View className={cx(!isWide && "flex-1")}>
          <Button
            hotkey={HOTKEYS.escape}
            onPress={() => {
              focus.toOpener();
              setUnsynced(0);
              // Waiting means sending: the changes go as soon as the server answers.
              sync.soon();
            }}
            ref={focus.cancelRef(question)}
            variant="secondary"
            width={isWide ? "auto" : "fill"}
          >
            {t("settings.logout.wait")}
          </Button>
        </View>
        <View className={cx(!isWide && "flex-1")}>
          <Button onPress={() => void logout()} variant="danger" width={isWide ? "auto" : "fill"}>
            {t("settings.logout.anyway")}
          </Button>
        </View>
      </View>
    </View>
  );
};
