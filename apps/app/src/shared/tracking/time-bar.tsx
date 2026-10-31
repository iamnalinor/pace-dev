import { CalendarDays, Coffee, House, type LucideIcon, Play, Timer } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { TimeButtonView } from "@pace/client";
import type { MessageKey } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { ActionCards } from "#app/shared/assistant/action-cards.tsx";
import { usePendingActions } from "#app/shared/assistant/use-pending-actions.ts";
import { inkClass, OUTLINE } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";

import type { CalendarToday } from "./calendar-today.ts";

import { ChoicesSheet } from "./choices-sheet.tsx";
import { RunningRow } from "./running-row.tsx";
import { FoldToggle, HIDDEN, useFold } from "./time-bar-fold.tsx";
import { useCalendarButton } from "./use-calendar-button.ts";

const ICONS: Readonly<Record<TimeButtonView["id"], LucideIcon>> = {
  calendar: CalendarDays,
  chores: House,
  rest: Coffee,
  task: Timer,
};

/**
"What are you doing?" first reads actions; the owner approves before anything is written.
*/
const TypedStart = ({ onUse }: { readonly onUse: () => void }) => {
  const t = useT();
  const { palette } = useTheme();
  const [text, setText] = useState("");
  const pending = usePendingActions("activity", () => {
    setText("");
  });
  const typed = text.trim();
  const start = (): void => {
    onUse();
    if (pending.pending !== null) {
      void pending.approve();
      // Reading already: Enter again would only send the same request twice.
    } else if (typed !== "" && !pending.busy) {
      pending.submit(typed);
    }
  };
  return (
    <View className="gap-2">
      {pending.pending === null ? null : (
        <ActionCards
          actions={pending.pending.actions}
          busy={pending.busy}
          onApprove={() => {
            onUse();
            void pending.approve();
          }}
          onCancel={pending.cancel}
          onFollowup={pending.followup}
          questions={pending.pending.questions}
          source={pending.pending.status}
        />
      )}
      {pending.busy && pending.pending === null ? (
        <Text accessibilityLiveRegion="polite" className="font-sans text-[13px] text-muted">
          {t("assistant.reading")}
        </Text>
      ) : null}
      {pending.issue === null ? null : (
        <Text accessibilityRole="alert" className="font-sans text-[13px] text-warn">
          {t(pending.issue)}
        </Text>
      )}
      <View className="flex-row items-center gap-2">
        <TextInput
          accessibilityLabel={t("time.whatDoing")}
          className="h-11 flex-1 rounded-lg border border-line bg-surface px-3 font-sans text-[15px] text-fg"
          maxLength={200}
          onChangeText={(next) => {
            onUse();
            pending.cancel();
            setText(next);
          }}
          onSubmitEditing={start}
          placeholder={t("time.whatDoing")}
          placeholderTextColor={palette.muted}
          returnKeyType="go"
          value={text}
        />
        <Pressable
          accessibilityLabel={t("assistant.review")}
          accessibilityRole="button"
          accessibilityState={{ disabled: typed === "" || pending.busy }}
          className={cx(
            "h-11 w-11 items-center justify-center rounded-lg bg-accent active:opacity-80",
            typed === "" && "opacity-50",
          )}
          disabled={typed === "" || pending.busy}
          onPress={start}
        >
          <Play color={palette.accentFg} fill={palette.accentFg} size={16} />
        </Pressable>
      </View>
    </View>
  );
};

type ButtonProps = {
  readonly button: TimeButtonView;
  /** Greyed: why it cannot start anything now (the Calendar button), shown in its tooltip. */
  readonly unavailable?: string | undefined;
  readonly onTap: (button: TimeButtonView) => void;
};

/**
How a button looks, and what its hint says a tap does: on (its activity runs: the picker opens
on Stop), greyed (cannot start now) or resting in its color.
*/
const buttonLook = (
  button: TimeButtonView,
  isGreyed: boolean,
): { readonly box: string; readonly ink: string; readonly hintKey: MessageKey } => {
  if (button.isRunning) {
    return {
      box: "border-accentQuiet bg-accentQuiet",
      hintKey: "time.buttonRunningHint",
      ink: "font-medium text-accentQuietFg",
    };
  }
  return isGreyed
    ? { box: "border-dashed border-line bg-surface", hintKey: "time.buttonHint", ink: "text-muted" }
    : {
        box: `bg-surface ${OUTLINE[button.color]}`,
        hintKey: "time.buttonHint",
        ink: inkClass(button.color),
      };
};

/**
A big button in its fixed place: icon over name, its color's outline, filled with the quiet
accent while its activity runs (a state, said in its name too). A tap always opens its picker.
*/
const BarButton = ({ button, onTap, unavailable }: ButtonProps) => {
  const t = useT();
  const { palette } = useTheme();
  const label = t(button.labelKey);
  const Icon = ICONS[button.id];
  const look = buttonLook(button, unavailable !== undefined);
  const restingColor = unavailable === undefined ? palette.fg2 : palette.muted;
  return (
    <View className="flex-1">
      {/* Greyed, it says why the moment the pointer is over it; a tap opens the picker, which says it too. */}
      <Tooltip label={unavailable} showsOnTap={false}>
        <Pressable
          accessibilityHint={unavailable ?? t(look.hintKey)}
          accessibilityLabel={button.isRunning ? t("time.buttonRunning", { label }) : label}
          accessibilityRole="button"
          className={cx(
            "h-14 items-center justify-center gap-0.5 rounded-xl border-2 px-1 active:opacity-80",
            look.box,
          )}
          onPress={() => {
            onTap(button);
          }}
        >
          <Icon color={button.isRunning ? palette.accentQuietFg : restingColor} size={18} />
          <Text
            className={cx("text-center font-sans text-[12px] leading-[14px]", look.ink)}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      </Tooltip>
    </View>
  );
};

/** The picker open: which button's (its view is read live, so Stop shows the moment it runs). */
type Opened = { readonly id: TimeButtonView["id"]; readonly calendar: CalendarToday | null };

/**
Which picker is open. Calendar's opens once today's calendar is read; only the picker asked for
last opens, so a read that answers late (another button tapped meanwhile, or the picker
closed) opens nothing over what is there.
*/
const usePicker = (readCalendar: () => Promise<CalendarToday>) => {
  const [opened, setOpened] = useState<null | Opened>(null);
  const askedRef = useRef<null | TimeButtonView["id"]>(null);
  return {
    close: (): void => {
      askedRef.current = null;
      setOpened(null);
    },
    open: async (button: TimeButtonView): Promise<void> => {
      askedRef.current = button.id;
      const today = button.kind === "calendar" ? await readCalendar() : null;
      if (askedRef.current === button.id) {
        setOpened({ calendar: today, id: button.id });
      }
    },
    opened,
  };
};

/** The four buttons in their fixed places. */
const BarButtons = ({
  buttons,
  calendarUnavailable,
  onTap,
}: {
  readonly buttons: readonly TimeButtonView[];
  readonly calendarUnavailable: string | undefined;
  readonly onTap: (button: TimeButtonView) => void;
}) => (
  <View className="flex-row gap-2">
    {buttons.map((button) => (
      <BarButton
        button={button}
        key={button.id}
        onTap={onTap}
        // Running its own activity, it is on, whatever the calendar says.
        unavailable={
          button.kind === "calendar" && !button.isRunning ? calendarUnavailable : undefined
        }
      />
    ))}
  </View>
);

/**
The time bar at the foot of Now: what runs (and what runs alongside), "What are you
doing?", and four buttons that never move — Calendar, Task, Chores and Rest — each opening
what it can start. On a phone, opened on something running, the field and the buttons fold
into one line under it, so the bar leaves room for the tasks; a tap unfolds them.
*/
export const TimeBar = () => {
  const t = useT();
  const { hooks } = usePace();
  const { alongside, buttons, running } = hooks.useTimeBar();
  const calendar = useCalendarButton();
  const { close, open, opened } = usePicker(calendar.forPicker);
  const openedButton = buttons.find((button) => button.id === opened?.id) ?? null;
  const lastUseRef = useRef(0);
  const markUse = (): void => {
    lastUseRef.current = Date.now();
  };
  const fold = useFold(running?.activityId ?? null, { isPicking: opened !== null, lastUseRef });
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className="gap-2 border-t border-line bg-bg px-3 pb-2.5 pt-2.5"
      role="region"
    >
      {[...(running === null ? [] : [running]), ...alongside].map((item) => (
        <RunningRow key={item.activityId} running={item} />
      ))}
      {fold.isFoldable ? <FoldToggle isOpen={fold.isUnfolded} onToggle={fold.toggle} /> : null}
      {/* Folded, the field stays mounted (hidden) so what was typed waits for the next unfold. */}
      <View className="gap-2" style={fold.isShown ? undefined : HIDDEN}>
        <TypedStart onUse={markUse} />
        <BarButtons
          buttons={buttons}
          calendarUnavailable={calendar.unavailable}
          onTap={(pressed) => {
            markUse();
            void open(pressed);
          }}
        />
      </View>
      {opened === null || openedButton === null ? null : (
        <ChoicesSheet
          button={openedButton}
          calendar={opened.calendar}
          canGoAlongside={running !== null && !openedButton.isRunning}
          onClose={() => {
            // A start picked here is the bar's own: closing must not fold it.
            markUse();
            close();
          }}
        />
      )}
    </View>
  );
};
