import { useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { usePace, useT } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { ScreenTimeSection } from "#app/shared/activity-usage.tsx";
import { useZonedDateParam } from "#app/shared/use-search-param.ts";
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
import { addDaysIn, formatEyebrow } from "@pace/core";

import { ActivityPane } from "./activity-pane.tsx";
import { ActivitySheet, type SheetTarget } from "./activity-sheet.tsx";
import { DayNav } from "./day-nav.tsx";
import { DayRail, NowMargin, type RowFrame, type RowFrames } from "./day-rail.tsx";
import { EntryRow, LogPastRow, type SatOf } from "./day-rows.tsx";
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
      onLayout={(event) => {
        const { height, y } = event.nativeEvent.layout;
        onFrame(entry.key, { height, top: y });
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
  const usageRead = useUsageRead(api, day.date, addDaysIn(day.date, 1, day.zone));
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
      <ScreenTimeSection
        date={day.date}
        key={day.date}
        onRetry={usageRead.isFailed ? usageRead.retry : null}
        usage={usageRead.rows}
        zone={day.zone}
      />
    </FirstSyncBody>
  );
};

/**
One day of the time ledger: totals per category, the timeline on its notebook page with its gaps,
edits. On a computer the editor opens in the inspector beside the day; on a phone, in a sheet.
*/
export const DayScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const isWide = useIsWide();
  // The day is in the address (`?date=`, feedback 5 item 6): a reload shows the same day.
  const [date, setDate] = useZonedDateParam("date");
  const [sheet, setSheet] = useState<null | SheetTarget>(null);
  const closeSheet = (): void => {
    setSheet(null);
  };
  const day = hooks.useDay(date);
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
};
