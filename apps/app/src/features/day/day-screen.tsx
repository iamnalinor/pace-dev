import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { usePace, useT } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { focusPlaceById } from "#app/platform/focus-place.ts";
import { ScreenTimeSection } from "#app/shared/activity-usage.tsx";
import { useBlockRetry } from "#app/shared/use-block-retry.ts";
import { useSearchParam, useZonedDateParam } from "#app/shared/use-search-param.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useWhereSat } from "#app/shared/use-where-sat.ts";
import { EmptyText, FirstSyncBody } from "#app/ui/empty-state.tsx";
import { Group } from "#app/ui/group.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { Shell } from "#app/ui/shell.tsx";
import { type DayEntry, type DayModel, dayRail } from "@pace/client";
import { useUsageRead } from "@pace/client/react";
import { formatEyebrow, nextDayStartIn } from "@pace/core";

import { ActivityPane } from "./activity-pane.tsx";
import { ActivitySheet, type SheetTarget } from "./activity-sheet.tsx";
import { DayNav } from "./day-nav.tsx";
import { DayRail, NowMargin, type RowFrame, type RowFrames } from "./day-rail.tsx";
import { EntryRow, isTarget, LogPastRow, type SatOf } from "./day-rows.tsx";
import { Totals } from "./day-totals.tsx";
import * as Phone from "./phone-section.tsx";
import { type DayPhone, useDayPhone } from "./use-day-phone.ts";

/**
The rows only animate for what changes within a day (a block logged, a gap closed): a new day
replaces the old in place, with no crossfade (F-MOT-07). The keys a date opened with never
animate; one that appears later does.
*/
const useOpeningKeys = (date: string, entries: readonly DayEntry[]): ReadonlySet<string> => {
  const [opening, setOpening] = useState(() => ({
    date,
    keys: new Set(entries.map((entry) => entry.key)),
  }));
  if (opening.date !== date) {
    setOpening({ date, keys: new Set(entries.map((entry) => entry.key)) });
  }
  return opening.date === date ? opening.keys : new Set(entries.map((entry) => entry.key));
};

type RowsProps = {
  readonly entries: readonly DayEntry[];
  /** The keys the day opened with: they never animate in. */
  readonly openingKeys: ReadonlySet<string>;
  readonly zone: string;
  readonly phone: DayPhone;
  readonly sat: SatOf;
  readonly selected: null | SheetTarget;
  readonly onOpen: (target: SheetTarget) => void;
  /** Each row says where it was laid out, for its rail bar to stand beside it. */
  readonly onFrame: (key: string, frame: RowFrame) => void;
};

/** The id of a day's row on the page (the web's `id`): where focus goes back to (`closeSheet`). */
const dayEntryId = (key: string): string => `day-entry-${key}`;

/** One keyed row per entry, for the `Group` to put its one divider rule between. */
const entryRows = ({
  entries,
  onFrame,
  onOpen,
  openingKeys,
  phone,
  sat,
  selected,
  zone,
}: RowsProps) =>
  entries.map((entry) => (
    <Animated.View
      key={entry.key}
      {...(!openingKeys.has(entry.key) && {
        entering: ROW_ENTER,
        exiting: ROW_EXIT,
        layout: ROW_LAYOUT,
      })}
      nativeID={dayEntryId(entry.key)}
      onLayout={(event) => {
        const { height, y } = event.nativeEvent.layout;
        // A hidden row (Day left behind on the web) measures nothing: its bar keeps its frame.
        if (height > 0) {
          onFrame(entry.key, { height, top: y });
        }
      }}
      testID="day-entry"
    >
      <EntryRow
        entry={entry}
        onOpen={onOpen}
        phone={phone}
        sat={sat}
        selected={selected}
        zone={zone}
      />
    </Animated.View>
  ));

/** The rows' measured frames by key: one source of geometry for the rail and the now line. */
const useRowFrames = () => {
  const [frames, setFrames] = useState<RowFrames>({});
  const onFrame = (key: string, frame: RowFrame): void => {
    setFrames((known) => {
      const was = known[key];
      return was?.top === frame.top && was.height === frame.height
        ? known
        : { ...known, [key]: frame };
    });
  };
  return { frames, onFrame };
};

/**
The timeline on the notebook page: the rail beside one list of rows (blocks, gaps and, last, "Log
past activity"), each bar at its own row's measured frame, and the red margin line across them
where now is. Rows report their frames in the list's coordinates, which are the rail's: the list
starts at the timeline's top.
*/
const Timeline = ({
  logPast,
  now,
  ...rows
}: Omit<RowsProps, "onFrame"> & {
  readonly logPast: () => void;
  readonly now: string;
}) => {
  const { frames, onFrame } = useRowFrames();
  const rail = dayRail(rows.entries, now);
  return (
    <View className="relative mx-gutter" testID="day-timeline">
      <DayRail frames={frames} rail={rail} still={rows.openingKeys} />
      <View className="ml-10">
        <Group inset={false}>
          {entryRows({ ...rows, onFrame })}
          <LogPastRow key="log-past" onPress={logPast} />
        </Group>
      </View>
      <NowMargin frames={frames} now={now} rail={rail} zone={rows.zone} />
    </View>
  );
};

/** The day's header: the title and the period control; another day clears the open editor. */
const DayHeader = ({
  day,
  onDate,
}: {
  readonly day: DayModel;
  readonly onDate: (date: null | string) => void;
}) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <ScreenHeader
      period={
        <DayNav day={day} label={formatEyebrow(day.date, day.zone, language)} onDate={onDate} />
      }
      title={t("day.title")}
      variant="top"
    />
  );
};

/** The day's page: totals, the timeline, the phone's and the devices' sections. */
const DayPage = ({
  day,
  onOpen,
  selected,
}: {
  readonly day: DayModel;
  readonly onOpen: (target: SheetTarget) => void;
  readonly selected: null | SheetTarget;
}) => {
  const t = useT();
  const { api, hooks } = usePace();
  const { now } = hooks.useClock();
  const phone = useDayPhone(day, now);
  const openingKeys = useOpeningKeys(day.date, day.entries);
  // One read of the day's usage for every part that shows it (QA round 21 L5).
  const usageRead = useUsageRead(api, day.date, nextDayStartIn(day.date, day.zone));
  const usageRetry = useBlockRetry(usageRead);
  const sat = useWhereSat(usageRead.rows);
  return (
    <FirstSyncBody>
      <Totals day={day} />
      {IS_PHONE && !phone.hasUsageAccess ? <Phone.UsageAccessHint /> : null}
      {day.entries.length === 0 ? (
        <EmptyText className="px-row-x py-6">{t("day.empty")}</EmptyText>
      ) : null}
      <Timeline
        entries={day.entries}
        // A new day starts with no frames: a row's old place is never another day's.
        key={`timeline-${day.date}`}
        logPast={() => {
          onOpen(day.logTarget);
        }}
        now={now}
        onOpen={onOpen}
        openingKeys={openingKeys}
        phone={phone}
        sat={sat}
        selected={selected}
        zone={day.zone}
      />
      {IS_PHONE ? (
        <Phone.CalendarSection entries={day.entries} phone={phone} zone={day.zone} />
      ) : null}
      {/* The web records no screen time: the section shows there only for what a phone or a
          computer sent (QA PR55-1-08: «0 мин · Нет данных» on every day, and a failure to load
          what was never there). */}
      {IS_PHONE || usageRead.rows.length > 0 ? (
        <ScreenTimeSection
          date={day.date}
          isFailed={usageRead.isFailed}
          key={day.date}
          onRetry={usageRetry}
          usage={usageRead.rows}
          zone={day.zone}
        />
      ) : null}
    </FirstSyncBody>
  );
};

/**
A block named in the address (`?block=<its key>`, Week's «Edit in Day»; review M3, R26-04) opens
in the editor once, as if picked; the param is then taken off in place, so closing the editor or
coming back later does not open it again. It waits for the device's copy to be read; a block
the day does not hold (deleted elsewhere) opens nothing and the param still goes.
*/
const useOpenedBlock = (
  day: { readonly entries: readonly { readonly key: string; readonly target: SheetTarget }[] },
  open: (target: SheetTarget) => void,
): void => {
  const [block, , forgetBlock] = useSearchParam("block");
  const [handled, setHandled] = useState<null | string>(null);
  // On a cold load the day has no blocks until the device's copy is read: wait for it (M10).
  const isRead = usePace().hooks.useAppState((state) => state.status === "ready");
  if (block === null && handled !== null) {
    setHandled(null);
  }
  if (isRead && block !== null && block !== handled) {
    setHandled(block);
    const entry = day.entries.find((candidate) => candidate.key === block);
    if (entry !== undefined) {
      open(entry.target);
    }
  }
  useEffect(() => {
    if (block !== null && block === handled) {
      forgetBlock();
    }
  }, [block, forgetBlock, handled]);
};

/**
One day of the time ledger: totals per category, the timeline on its notebook page with its gaps,
edits. On a computer the editor opens in the inspector beside the day; on a phone, in a sheet.
*/
export const DayScreen = memo(function DayScreen() {
  const t = useT();
  const { hooks } = usePace();
  const isWide = useIsWide();
  // The day is in the address (`?date=`, feedback 5 item 6): a reload shows the same day.
  const [date, setDate] = useZonedDateParam("date");
  const day = hooks.useDay(date);
  // The block picked belongs to the day it was picked on: browser Back or Forward changes the
  // day in the address and keeps the screen mounted, so another day reads as no pick, derived and
  // not written back (review of round 24, I1; bug-lessons 201).
  const [picked, setPicked] = useState<null | {
    readonly date: string;
    readonly target: SheetTarget;
  }>(null);
  const sheet = picked?.date === day.date ? picked.target : null;
  const setSheet = (target: null | SheetTarget): void => {
    setPicked(target === null ? null : { date: day.date, target });
  };
  useOpenedBlock(day, setSheet);
  const closeSheet = (): void => {
    // Opened from the address (Week's «Edit in Day»), the editor had no control to give focus back
    // to: the row it edited takes it, where nothing else did (R27-09).
    const edited = day.entries.find((entry) => isTarget(entry, sheet));
    setSheet(null);
    if (edited !== undefined) {
      focusPlaceById(dayEntryId(edited.key));
    }
  };
  const screen = (
    <Screen
      anchor="wide"
      header={
        <DayHeader
          day={day}
          onDate={(next) => {
            // A block of the day left behind is not the next day's selection.
            setSheet(null);
            setDate(next);
          }}
        />
      }
    >
      <DayPage day={day} onOpen={setSheet} selected={sheet} />
    </Screen>
  );
  if (!isWide) {
    return (
      <>
        {screen}
        <OverlayPresence value={sheet}>
          {(kept) => <ActivitySheet onClose={closeSheet} target={kept} zone={day.zone} />}
        </OverlayPresence>
      </>
    );
  }
  // The editor opens beside the day, collapsed while nothing is picked (F-LAY-03).
  const pane =
    sheet === null ? undefined : (
      <ActivityPane
        key={`${sheet.kind}-${sheet.startAt}`}
        onClose={closeSheet}
        target={sheet}
        zone={day.zone}
      />
    );
  return (
    <Shell
      content={screen}
      inspector={pane}
      inspectorLabel={t("day.details")}
      inspectorOpen={sheet !== null}
      onInspectorClose={closeSheet}
    />
  );
});
