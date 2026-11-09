import { useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TimeButtonView } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { layout } from "@pace/core";

import type { CalendarToday } from "./calendar-today.ts";

import { BarTiles } from "./bar-tiles.tsx";
import { ChoicesSheet } from "./choices-sheet.tsx";
import { RunningCard } from "./running-card.tsx";
import { useFold } from "./time-bar-fold.tsx";
import { TypedStart, useTypedStart } from "./typed-start.tsx";
import { useCalendarButton } from "./use-calendar-button.ts";
import { useRunningAnnouncements } from "./use-running-announcements.ts";

/** The share of the window the time bar and the nav bar under it may take (spec §5.1). */
const BUDGET = 0.4;

/** From this width the bar lays what runs beside the field and the tiles (spec §5.1, desktop). */
const SIDE_BY_SIDE = 680;

/**
Which picker is open. Calendar's opens once today's calendar is read; only the picker asked for
last opens, so a read that answers late (another button tapped meanwhile, or the picker
closed) opens nothing over what is there.
*/
const usePicker = (readCalendar: () => Promise<CalendarToday>) => {
  /** The picker open: which button's (its view is read live, so Stop shows the moment it runs). */
  type Opened = { readonly id: TimeButtonView["id"]; readonly calendar: CalendarToday | null };
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

/** The anchors of the four tiles: a wide window opens each picker as a popover on its tile. */
const useTileAnchors = () => ({
  calendar: useRef<null | View>(null),
  chores: useRef<null | View>(null),
  rest: useRef<null | View>(null),
  task: useRef<null | View>(null),
});

/**
The bar's measured size against the region budget (spec §5.1): on a phone the time bar and the nav
bar under it take at most 40 % of the window, so the list keeps the rest. Measured, never guessed
from a count of what runs (bug-lessons 142); a wide window has no nav bar and lays the bar out side
by side once it is 680 wide.
*/
const useBarSize = () => {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const [size, setSize] = useState({ height: 0, width: 0 });
  const nav = isWide ? 0 : layout.navBar + insets.bottom;
  return {
    isOverBudget: size.height + nav > height * BUDGET,
    isSideBySide: size.width >= SIDE_BY_SIDE,
    onLayout: (event: { readonly nativeEvent: { readonly layout: typeof size } }): void => {
      const { height: barHeight, width } = event.nativeEvent.layout;
      setSize((was) =>
        was.height === barHeight && was.width === width ? was : { height: barHeight, width },
      );
    },
  };
};

/** The fold of the typed field, and the mark a use of the bar leaves so a start it made never folds it. */
const useBarFold = (runningId: null | string, isPicking: boolean, isOverBudget: boolean) => {
  const lastUseRef = useRef(0);
  const fold = useFold(runningId, { isOverBudget, isPicking, lastUseRef });
  return {
    fold,
    markUse: (): void => {
      lastUseRef.current = Date.now();
    },
  };
};

/** The open picker's tile, read live (so Stop shows the moment it runs), and what it opened with. */
const pickedOf = (
  buttons: readonly TimeButtonView[],
  opened: null | { readonly id: TimeButtonView["id"]; readonly calendar: CalendarToday | null },
) => {
  const button = buttons.find((each) => each.id === opened?.id);
  return opened === null || button === undefined ? null : { button, opened };
};

/** What runs, as the bar shows it: the main activity's card, with the others alongside in it. */
const useBarCards = () => {
  const { alongside, running } = usePace().hooks.useTimeBar();
  const [main, ...others] = running === null ? alongside : [running, ...alongside];
  useRunningAnnouncements(main === undefined ? others : [main, ...others]);
  return { main, others };
};

/** The typed field, folded under «Start something else» while the bar says so. */
const FoldedField = ({
  children,
  fold,
}: {
  readonly children: React.ReactNode;
  readonly fold: ReturnType<typeof useFold>;
}) => {
  const t = useT();
  return fold.isFoldable ? (
    <Disclosure label={t("time.startOther")} onToggle={fold.toggle} open={fold.isUnfolded}>
      {children}
    </Disclosure>
  ) : (
    children
  );
};

/** The picker a tile opened, kept through its exit: the sheet leaves with what it showed (F-MOT-05). */
const OpenedPicker = ({
  anchors,
  isSomethingRunning,
  onClose,
  picked,
}: {
  readonly anchors: ReturnType<typeof useTileAnchors>;
  readonly isSomethingRunning: boolean;
  readonly onClose: () => void;
  readonly picked: null | {
    readonly button: TimeButtonView;
    readonly opened: { readonly calendar: CalendarToday | null };
  };
}) => (
  <OverlayPresence value={picked}>
    {(kept) => (
      <ChoicesSheet
        anchor={anchors[kept.button.id]}
        button={kept.button}
        calendar={kept.opened.calendar}
        canGoAlongside={isSomethingRunning && !kept.button.isRunning}
        onClose={onClose}
      />
    )}
  </OverlayPresence>
);

/**
The time bar at the foot of Now: what runs (what runs alongside as compact rows in the same card),
"What are you doing?", and four tiles that never move and never fold — Calendar, Task, Chores and
Rest — each opening what it can start. Nothing in it scrolls and nothing is covered (design review
B2): on a phone the typed field folds under «Start something else» once the bar would pass the
budget, and a proposal for the typed line opens as a sheet. On a computer's column of 680 and more,
what runs sits on the left and the field and the tiles on the right.
*/
export const TimeBar = () => {
  const t = useT();
  const { buttons, running } = usePace().hooks.useTimeBar();
  const calendar = useCalendarButton();
  const { close, open, opened } = usePicker(calendar.forPicker);
  const anchors = useTileAnchors();
  const [text, setText] = useState("");
  const typed = useTypedStart(text, setText);
  const size = useBarSize();
  const { main, others } = useBarCards();
  const { fold, markUse } = useBarFold(
    running?.activityId ?? null,
    opened !== null,
    size.isOverBudget,
  );
  const isSideBySide = size.isSideBySide && main !== undefined;
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className={cx(
        "gap-2 border-t border-separator bg-app px-3 pb-3 pt-3",
        isSideBySide && "flex-row items-start gap-3",
      )}
      onLayout={size.onLayout}
      role="region"
    >
      {main === undefined ? null : (
        <View className={cx(isSideBySide && "flex-1")}>
          <RunningCard alongside={others} running={main} />
        </View>
      )}
      <View className={cx("gap-2", isSideBySide && "flex-1")}>
        <FoldedField fold={fold}>
          <TypedStart onUse={markUse} setText={setText} typed={typed} />
        </FoldedField>
        <BarTiles
          anchors={anchors}
          buttons={buttons}
          calendarUnavailable={calendar.unavailable}
          onTap={(pressed) => {
            markUse();
            void open(pressed);
          }}
        />
      </View>
      <OpenedPicker
        anchors={anchors}
        isSomethingRunning={running !== null}
        onClose={() => {
          // A start picked here is the bar's own: closing must not fold it.
          markUse();
          close();
        }}
        picked={pickedOf(buttons, opened)}
      />
    </View>
  );
};
