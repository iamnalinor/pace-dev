import type { ReactNode } from "react";

import {
  AlignLeft,
  CalendarDays,
  ExternalLink,
  type LucideIcon,
  MapPin,
  User,
  Users,
  Video,
  X,
} from "lucide-react-native";
import { Linking, ScrollView, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useWhereSat } from "#app/shared/use-where-sat.ts";
import { WhereSatLine } from "#app/shared/where-sat-line.tsx";
import { Button } from "#app/ui/button.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { type EventDetails, eventDetails, type WeekBlock, type WeekModel } from "@pace/client";
import { formatDuration, type Language, plural } from "@pace/core";

import { dayLabel, type Picked } from "./week-grid.tsx";

/** Opens an address from the calendar; a refusal (no app for it) leaves the screen as it is. */
const openAsync = async (url: string): Promise<void> => {
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing on the device opens it: the details stay as they are.
  }
};

const open = (url: string): void => {
  void openAsync(url);
};

/**
"6 Tue, 12:30–14:00"; an event past midnight names both days: "17 Sat, 17:44 – 18 Sun, 10:43".
*/
const whenText = (
  stretch: { readonly startAt: string; readonly endAt: string; readonly isMultiDay: boolean },
  zone: string,
  language: Language,
): string => {
  const start = `${dayLabel(stretch.startAt, zone, language)}, ${clockTime(stretch.startAt, zone)}`;
  return stretch.isMultiDay
    ? `${start} – ${dayLabel(stretch.endAt, zone, language)}, ${clockTime(stretch.endAt, zone)}`
    : `${start}–${clockTime(stretch.endAt, zone)}`;
};

/** The pick's title and its day and hours, for the pane's header or the sheet's title. */
const useHeading = (
  picked: Picked,
  zone: string,
): { readonly title: string; readonly when: string } => {
  const { language } = useViewer();
  if (picked.kind === "block") {
    const when = whenText({ ...picked.block, isMultiDay: false }, zone, language);
    return { title: picked.block.label, when };
  }
  const details = eventDetails(picked.event, zone);
  return { title: details.title, when: whenText(details, zone, language) };
};

/** One fact about the event: a small icon, then the words. */
const Fact = ({
  children,
  icon: Icon,
}: {
  readonly children: ReactNode;
  readonly icon: LucideIcon;
}) => {
  const { palette } = useTheme();
  return (
    <View className="flex-row items-start gap-3">
      <View className="pt-0.5">
        <Icon color={palette.muted} size={16} strokeWidth={1.75} />
      </View>
      <View className="min-w-0 flex-1 gap-1">{children}</View>
    </View>
  );
};

const FACT_TEXT = "font-sans text-[14px] leading-5 text-fg";
/** A link in the quiet accent's text color, as the notes' links: one color only, no clash. */
const LINK_TEXT = "text-accentQuietText underline";
const LOCATION_TEXT = `font-sans text-[14px] leading-5 ${LINK_TEXT}`;

/** The notes' first lines, their web addresses tappable. */
const Notes = ({ notes }: { readonly notes: NonNullable<EventDetails["notes"]> }) => {
  const t = useT();
  return (
    <>
      <Text className={FACT_TEXT}>
        {notes.parts.map((part) =>
          part.kind === "link" ? (
            <Text
              accessibilityRole="link"
              className={LINK_TEXT}
              key={part.at}
              onPress={() => {
                open(part.url);
              }}
            >
              {part.text}
            </Text>
          ) : (
            <Text key={part.at}>{part.text}</Text>
          ),
        )}
      </Text>
      {notes.isCut ? (
        <Text className="font-sans text-[12px] text-muted">{t("calendar.notesCut")}</Text>
      ) : null}
    </>
  );
};

/** What the phone's calendar told about the event, each fact only when it told it. */
const EventFacts = ({ details }: { readonly details: EventDetails }) => {
  const t = useT();
  const { language } = useViewer();
  const { attendeeCount, calendarName, link, location, notes, organizer } = details;
  return (
    <View className="gap-3">
      <Fact icon={CalendarDays}>
        <Text className={FACT_TEXT}>{calendarName ?? t("week.calendarEvent")}</Text>
      </Fact>
      {location === null ? null : (
        <Fact icon={MapPin}>
          <Text
            accessibilityHint={t("calendar.openMaps")}
            accessibilityRole="link"
            className={LOCATION_TEXT}
            onPress={() => {
              open(location.mapsUrl);
            }}
          >
            {location.text}
          </Text>
        </Fact>
      )}
      {organizer === null ? null : (
        <Fact icon={User}>
          <Text className={FACT_TEXT}>{t("calendar.organizer", { name: organizer })}</Text>
        </Fact>
      )}
      {attendeeCount === null ? null : (
        <Fact icon={Users}>
          <Text className={FACT_TEXT}>
            {plural(language, attendeeCount, {
              few: t("calendar.people.few"),
              many: t("calendar.people.many"),
              one: t("calendar.people.one"),
              other: t("calendar.people.other"),
            })}
          </Text>
        </Fact>
      )}
      {notes === null ? null : (
        <Fact icon={AlignLeft}>
          <Notes notes={notes} />
        </Fact>
      )}
      {link === null ? null : (
        <Button
          icon={link.isCall ? Video : ExternalLink}
          onPress={() => {
            open(link.url);
          }}
          variant="secondary"
        >
          {t(link.isCall ? "calendar.joinCall" : "calendar.openLink")}
        </Button>
      )}
    </View>
  );
};

/** Tracked time: its category and length, where it went on the devices, and its task. */
const BlockFacts = ({
  block,
  onLeave,
  week,
}: {
  readonly block: WeekBlock;
  readonly week: WeekModel;
  readonly onLeave: () => void;
}) => {
  const t = useT();
  const { language } = useViewer();
  const openTask = useOpenTask();
  const sat = useWhereSat(week.weekStart, week.weekEnd);
  const { taskId } = block;
  return (
    <View className="gap-1">
      <Text className="font-sans text-[14px] text-fg">
        {[t(`category.${block.category}`), formatDuration(block.minutes, language)].join(" · ")}
      </Text>
      <WhereSatLine isIndented={false} rows={sat(block.startAt, block.endAt)} />
      {/* Slot: "the apps used during this activity" (a follow-up, on Week and Day) goes here,
      after where the block's time sat on the devices and before its task. */}
      {taskId === null ? null : (
        <Button
          onPress={() => {
            onLeave();
            openTask(taskId);
          }}
          variant="secondary"
        >
          {t("week.openTask")}
        </Button>
      )}
    </View>
  );
};

/** The facts of a pick, the same in the pane and in the sheet. */
const PickedFacts = ({
  onLeave,
  picked,
  week,
}: {
  readonly picked: Picked;
  readonly week: WeekModel;
  /** The pick is being left for another screen (its task). */
  readonly onLeave: () => void;
}) =>
  picked.kind === "block" ? (
    <BlockFacts block={picked.block} onLeave={onLeave} week={week} />
  ) : (
    <EventFacts details={eventDetails(picked.event, week.zone)} />
  );

/** A pick, the week it is on, and how to let it go. */
type PickedProps = {
  readonly picked: Picked;
  readonly week: WeekModel;
  readonly onClose: () => void;
};

/** A phone's details: the bottom sheet over the grid. */
export const PickedSheet = ({ onClose, picked, week }: PickedProps) => {
  const t = useT();
  const { title, when } = useHeading(picked, week.zone);
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} subtitle={when} title={title} visible>
      <PickedFacts onLeave={onClose} picked={picked} week={week} />
    </Sheet>
  );
};

/** A wide window's details beside the grid: the pick, or how to make one. */
export const PickedPane = ({
  onClose,
  picked,
  week,
}: Omit<PickedProps, "picked"> & { readonly picked: null | Picked }) => {
  const t = useT();
  if (picked === null) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center font-sans text-[14px] text-muted">{t("week.pickHint")}</Text>
      </View>
    );
  }
  return <PickedPaneBody onClose={onClose} picked={picked} week={week} />;
};

const PickedPaneBody = ({ onClose, picked, week }: PickedProps) => {
  const t = useT();
  const { title, when } = useHeading(picked, week.zone);
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 pb-10 pt-6">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="font-sans text-[20px] font-semibold text-fg">
            {title}
          </Text>
          <Text className="mt-1 font-sans text-[13px] text-muted">{when}</Text>
        </View>
        <View className="-mr-2 -mt-1.5">
          <IconButton icon={X} label={t("common.close")} onPress={onClose} variant="plain" />
        </View>
      </View>
      <PickedFacts onLeave={onClose} picked={picked} week={week} />
    </ScrollView>
  );
};
