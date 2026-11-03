import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { useAuth, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { cx } from "#app/ui/cx.ts";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { type Language, plural } from "@pace/core";

/**
The outbox's size read now, or null when the read failed: an unknown count asks, as a non-zero one
does (a quiet fallback to 0 would drop changes without a word).
*/
const readUnsynced = async (read: () => Promise<number>): Promise<null | number> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

/** The confirm's question: how many changes would be lost, or that some may be, when unread. */
const questionOf = (
  t: ReturnType<typeof useT>,
  language: Language,
  count: null | number,
): string =>
  count === null
    ? t("settings.logout.unsynced.unknown")
    : plural(language, count, {
        few: t("settings.logout.unsynced.few"),
        many: t("settings.logout.unsynced.many"),
        one: t("settings.logout.unsynced.one"),
        other: t("settings.logout.unsynced.other"),
      });

/**
Log out, which takes the local copy with it: when the outbox still holds changes the server has
not acknowledged (offline, a server down), it asks first, naming how many (or saying some may not
have, when the outbox cannot be read), with Wait (which sends them now) or Log out anyway (QA round
23 R23-02). The count is read at the press. With nothing unsent it logs out at once. Log out
stays reachable either way. Focus moves to Wait with the question said, and back to Log out on
Wait (bug class 5).
*/
export const LogoutButton = () => {
  const t = useT();
  const language = useLanguage();
  const isWide = useIsWide();
  const { auth } = useAuth();
  const { sync, unsyncedCount } = usePace();
  const focus = useConfirmFocus();
  // What the confirm asks about: closed, a count, or `null` when the outbox could not be read.
  const [asked, setAsked] = useState<null | { readonly count: null | number }>(null);
  const readingRef = useRef(false);
  // Read at the press, not ahead: a count read ahead was 0 until its first read answered and just
  // after a write until its refresh did, so a fresh change went without a word (re-review N2).
  const ask = async (): Promise<void> => {
    if (readingRef.current) {
      return;
    }
    readingRef.current = true;
    const count = await readUnsynced(unsyncedCount);
    readingRef.current = false;
    if (count === 0) {
      // Signed out on the device before the server is told: the route gate shows the login card
      // at once. Nothing navigates after it, which remounted that card under the person's typing
      // (PR A re-review N1, bug class 118).
      await auth.logout();
      return;
    }
    focus.toCancel();
    setAsked({ count });
  };
  if (asked === null) {
    return (
      <Button onPress={() => void ask()} ref={focus.openerRef()} variant="secondary">
        {t("settings.logout")}
      </Button>
    );
  }
  const question = questionOf(t, language, asked.count);
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
              setAsked(null);
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
          <Button
            onPress={() => void auth.logout()}
            variant="danger"
            width={isWide ? "auto" : "fill"}
          >
            {t("settings.logout.anyway")}
          </Button>
        </View>
      </View>
    </View>
  );
};
