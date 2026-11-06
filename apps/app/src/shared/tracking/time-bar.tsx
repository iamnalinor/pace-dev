import { useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

import type { TimeButtonView } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";

import type { CalendarToday } from "./calendar-today.ts";

import { BarTiles } from "./bar-tiles.tsx";
import { ChoicesSheet } from "./choices-sheet.tsx";
import { RunningCard } from "./running-card.tsx";
import { useFold } from "./time-bar-fold.tsx";
import { TypedStart, useTypedStart } from "./typed-start.tsx";
import { useCalendarButton } from "./use-calendar-button.ts";
import { useRunningAnnouncements } from "./use-running-announcements.ts";

/** The share of the window the bar's cards and proposals may take before they scroll (spec 3.3). */
const BUDGET = 0.4;

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

/** The fold of the typed field, and the mark a use of the bar leaves so a start it made never folds it. */
const useBarFold = (runningId: null | string, isPicking: boolean) => {
  const lastUseRef = useRef(0);
  const fold = useFold(runningId, { isPicking, lastUseRef });
  return {
    fold,
    markUse: (): void => {
      lastUseRef.current = Date.now();
    },
  };
};

/**
The cards and the typed field under the region budget: what runs and the proposal being read
scroll inside 40 % of the window less the tiles, so the list above keeps its half (spec 3.3).
*/
const Budgeted = ({
  children,
  reserved,
}: {
  readonly children: React.ReactNode;
  readonly reserved: number;
}) => {
  const { height } = useWindowDimensions();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0, maxHeight: Math.max(0, height * BUDGET - reserved) }}
      testID="time-bar-scroll"
    >
      <View className="gap-2">{children}</View>
    </ScrollView>
  );
};

/**
The time bar at the foot of Now: what runs (and what runs alongside), "What are you doing?", and
four tiles that never move and never fold — Calendar, Task, Chores and Rest — each opening what
it can start. On a phone, opened on something running, only the typed field folds, under «Start
something else»; a tap unfolds it. The bar's cards scroll past 40 % of the window.
*/
export const TimeBar = () => {
  const t = useT();
  const { hooks } = usePace();
  const { alongside, buttons, running } = hooks.useTimeBar();
  const calendar = useCalendarButton();
  const { close, open, opened } = usePicker(calendar.forPicker);
  const anchors = useTileAnchors();
  const openedButton = buttons.find((button) => button.id === opened?.id) ?? null;
  const [text, setText] = useState("");
  const typed = useTypedStart(text, setText);
  const [tilesHeight, setTilesHeight] = useState(0);
  const cards = [...(running === null ? [] : [running]), ...alongside];
  useRunningAnnouncements(cards);
  const { fold, markUse } = useBarFold(running?.activityId ?? null, opened !== null);
  const field = <TypedStart onUse={markUse} setText={setText} typed={typed} />;
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className="gap-2 border-t border-separator bg-app px-3 pb-3 pt-3"
      role="region"
    >
      <Budgeted reserved={tilesHeight}>
        {cards.map((item) => (
          <RunningCard key={item.activityId} running={item} />
        ))}
        {fold.isFoldable ? (
          <Disclosure label={t("time.startOther")} onToggle={fold.toggle} open={fold.isUnfolded}>
            {field}
          </Disclosure>
        ) : (
          field
        )}
      </Budgeted>
      <View
        onLayout={(event) => {
          setTilesHeight(event.nativeEvent.layout.height + 48);
        }}
      >
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
      {/* Kept through its exit: the sheet leaves with what it showed (F-MOT-05). */}
      <OverlayPresence
        value={opened === null || openedButton === null ? null : { button: openedButton, opened }}
      >
        {(kept) => (
          <ChoicesSheet
            anchor={anchors[kept.button.id]}
            button={kept.button}
            calendar={kept.opened.calendar}
            canGoAlongside={running !== null && !kept.button.isRunning}
            onClose={() => {
              // A start picked here is the bar's own: closing must not fold it.
              markUse();
              close();
            }}
          />
        )}
      </OverlayPresence>
    </View>
  );
};
