import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useCalendarPrompt } from "#app/shared/tracking/use-calendar-prompt.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { useToast } from "#app/ui/toast.tsx";
import { calendarEventKey, type MessageKey } from "@pace/core";

/** How long the outcome stays when nobody is on it (a mouse press, a phone without a reader). */
const OUTCOME_MS = 8000;

/** What was answered, and for which event (`calendarEventKey`), to say once its card has gone. */
type Outcome = { readonly eventKey: string; readonly key: MessageKey; readonly title: string };

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
      <Text className="font-sans text-footnote text-label-secondary">{text}</Text>
    </View>
  );
};

type ShownEvent = NonNullable<ReturnType<typeof useCalendarPrompt>["event"]>;

/**
One event's card: its title and time, Attend and Skip. Each press goes to `onAnswer` with what
it said and whether it went through; a refused Skip says so in a toast (the card stays).
*/
const EventCard = ({
  event,
  onAnswer,
  skip,
}: {
  readonly event: ShownEvent;
  readonly onAnswer: (key: MessageKey, sent: Promise<boolean>) => void;
  readonly skip: (event: ShownEvent) => Promise<boolean>;
}) => {
  const t = useT();
  const { actions } = usePace();
  const { deviceTz } = useViewer();
  const run = useRunAction();
  const toast = useToast();
  const didSkipOrSay = async (): Promise<boolean> => {
    const isSkipped = await skip(event);
    if (!isSkipped) {
      toast.show({ message: t("notifications.failedAction") });
    }
    return isSkipped;
  };
  const onAttend = (): void => {
    onAnswer("notify.resolved.attended", run(actions.startCalendar(event)));
  };
  const onSkip = (): void => {
    onAnswer("notify.resolved.skipped", didSkipOrSay());
  };
  return (
    <View
      aria-label={t("day.calendar")}
      className="mx-4 mb-3 gap-3 rounded-xl border border-separator bg-cell px-4 py-3"
      role="region"
    >
      <View className="gap-0.5">
        <Text className="font-sans text-callout font-medium text-label-primary">{event.title}</Text>
        <Text className="font-sans text-footnote tabular-nums text-label-secondary">
          {`${clockTime(event.startAt, deviceTz)}–${clockTime(event.endAt, deviceTz)}`}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button onPress={onAttend} width="fill">
            {t("time.attend")}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={onSkip} variant="secondary" width="fill">
            {t("phone.skip")}
          </Button>
        </View>
      </View>
    </View>
  );
};

/**
A calendar event about to start (or going on) that nobody answered yet: Attend tracks it under
its title from its start, Skip waves it away on every channel (or says it did not go through).
Once answered, the card gives way to its outcome, which takes the focus. Each card is its event's
own (keyed): when the next event follows at once, its card is new, so focus can never stay on its
Attend or Skip (fix round 1); the outcome line above it takes the focus instead.
*/
export const CalendarPrompt = () => {
  const { event, skip } = useCalendarPrompt();
  const [outcome, setOutcome] = useState<null | Outcome>(null);
  const focus = useConfirmFocus();
  const clearOutcome = useCallback(() => {
    setOutcome(null);
  }, []);
  const eventKey = event === null ? null : calendarEventKey(event);
  // The answered event has gone (none follows, or the next one does): its outcome is said.
  const isOutcomeShown = outcome !== null && outcome.eventKey !== eventKey;
  return (
    <>
      {isOutcomeShown ? (
        <OutcomeLine onGone={clearOutcome} outcome={outcome} statusRef={focus.statusRef()} />
      ) : null}
      {event === null || eventKey === null ? null : (
        <EventCard
          event={event}
          key={eventKey}
          // The press is sent: its outcome waits for the card to go; a refusal keeps the card.
          onAnswer={(key, sent) => {
            focus.toStatus();
            setOutcome({ eventKey, key, title: event.title });
            void (async () => {
              if (await sent) {
                return;
              }
              focus.release();
              setOutcome(null);
            })();
          }}
          skip={skip}
        />
      )}
    </>
  );
};
