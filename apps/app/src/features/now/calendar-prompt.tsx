import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useCalendarPrompt } from "#app/shared/tracking/use-calendar-prompt.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { useToast } from "#app/ui/toast.tsx";

/** How long the outcome stays when nobody is on it (a mouse press, a phone without a reader). */
const OUTCOME_MS = 8000;

/** What was answered, to say once the card has gone. */
type Outcome = { readonly key: MessageKey; readonly title: string };

/**
The outcome in the card's place ("✓ Attending · Seminar"): it takes the focus the card's button
held (bug class 5; never another card's Attend or Skip), and goes once focus leaves it or, when
nobody is on it, after a few seconds.
*/
const OutcomeLine = ({
  onGone,
  outcome,
  statusRef,
}: {
  readonly onGone: () => void;
  readonly outcome: Outcome;
  readonly statusRef: (node: null | View) => void;
}) => {
  const t = useT();
  const [isFocused, setIsFocused] = useState(false);
  const text = `${t(outcome.key)} · ${outcome.title}`;
  useEffect(() => {
    if (isFocused) {
      return;
    }
    const timer = setTimeout(onGone, OUTCOME_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isFocused, onGone]);
  return (
    <View
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      accessible
      className="mx-4 mb-3 px-1"
      onBlur={() => {
        setIsFocused(false);
        onGone();
      }}
      onFocus={() => {
        setIsFocused(true);
      }}
      ref={statusRef}
      role="status"
      tabIndex={-1}
    >
      <Text className="font-sans text-[13px] text-muted">{text}</Text>
    </View>
  );
};

/**
A calendar event about to start (or going on) that nobody answered yet: Attend tracks it under
its title from its start, Skip waves it away on every channel (or says it did not go through).
Once answered, the card gives way to its outcome, which takes the focus.
*/
export const CalendarPrompt = () => {
  const t = useT();
  const { actions } = usePace();
  const { deviceTz } = useViewer();
  const run = useRunAction();
  const toast = useToast();
  const { event, skip } = useCalendarPrompt();
  const [outcome, setOutcome] = useState<null | Outcome>(null);
  const focus = useConfirmFocus();
  const clearOutcome = useCallback(() => {
    setOutcome(null);
  }, []);
  if (event === null) {
    return outcome === null ? null : (
      <OutcomeLine onGone={clearOutcome} outcome={outcome} statusRef={focus.statusRef()} />
    );
  }
  /** Skips the event, or says the skip did not go through (the card stays to tap again). */
  const didSkipOrSay = async (shown: NonNullable<typeof event>): Promise<boolean> => {
    const isSkipped = await skip(shown);
    if (!isSkipped) {
      toast.show({ message: t("notifications.failedAction") });
    }
    return isSkipped;
  };
  /** The press is sent: its outcome waits for the card to go; a refusal keeps the card. */
  const answer = (key: MessageKey, sent: Promise<boolean>): void => {
    focus.toStatus();
    setOutcome({ key, title: event.title });
    void (async () => {
      if (await sent) {
        return;
      }
      focus.release();
      setOutcome(null);
    })();
  };
  return (
    <View
      aria-label={t("day.calendar")}
      className="mx-4 mb-3 gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3"
      role="region"
    >
      <View className="gap-0.5">
        <Text className="font-sans text-[15px] font-medium text-fg">{event.title}</Text>
        <Text className="font-sans text-[13px] tabular-nums text-muted">
          {`${clockTime(event.startAt, deviceTz)}–${clockTime(event.endAt, deviceTz)}`}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            onPress={() => {
              answer("notify.resolved.attended", run(actions.startCalendar(event)));
            }}
            width="fill"
          >
            {t("time.attend")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() => {
              answer("notify.resolved.skipped", didSkipOrSay(event));
            }}
            variant="secondary"
            width="fill"
          >
            {t("phone.skip")}
          </Button>
        </View>
      </View>
    </View>
  );
};
