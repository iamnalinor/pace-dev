import { useRef, useState } from "react";
import { Text, type TextInput, View } from "react-native";

import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import {
  type ActivityForm,
  activityFormOf,
  type ActivityRange,
  type ActivitySheetProps,
  type ActivityTarget,
  type FormPartProps,
  hasEnd,
  typeTime,
} from "@pace/client";
import { useDraft } from "@pace/client/react";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  addDaysIn,
  CATEGORY_COLORS,
  formatEyebrow,
  type MessageKey,
} from "@pace/core";

/** What the sheet edits: an existing block (move and rename) or a new past one. */
export type SheetTarget = ActivityTarget;

type Draft = ActivityForm;

/** Which field reads wrong, if any: its sentence goes under it. */
type Faults = {
  readonly label: MessageKey | null;
  readonly from: MessageKey | null;
  readonly to: MessageKey | null;
};

/** An end before the start reads as past midnight only for a block this long at most. */
const MAX_OVERNIGHT_MS = 12 * 3_600_000;

/**
The end on the block's day, or after midnight when it is earlier than the start and the night
is short; `null` for an end equal to the start or a reversed pair (10:00 → 09:30), which
would otherwise silently make a day-long block.
*/
const endOf = (sameDay: string, startAt: string, zone: string): null | string => {
  if (sameDay > startAt) {
    return sameDay;
  }
  const nextDay = addDaysIn(sameDay, 1, zone);
  const length = Date.parse(nextDay) - Date.parse(startAt);
  return sameDay < startAt && length <= MAX_OVERNIGHT_MS ? nextDay : null;
};

/**
The typed clock times on the block's own day (see `endOf` for one past midnight). A logged
block needs its end; a running one has none yet.
*/
/** What is wrong with the end, if anything: missing on a logged block, not a time, reversed. */
const toFault = (
  draft: Draft,
  target: SheetTarget,
  times: {
    readonly startAt: null | string;
    readonly sameDay: null | string;
    readonly zone: string;
  },
): MessageKey | null => {
  if (draft.to === "") {
    return target.kind === "log" ? "day.badTime" : null;
  }
  if (times.sameDay === null) {
    return "day.badTime";
  }
  return times.startAt !== null && endOf(times.sameDay, times.startAt, times.zone) === null
    ? "day.badRange"
    : null;
};

const readDraft = (
  draft: Draft,
  target: SheetTarget,
  zone: string,
): { readonly range: ActivityRange | null; readonly faults: Faults } => {
  const { date } = wallClock(target.startAt, zone);
  const startAt = fromWallClock({ date, time: draft.from, tz: zone });
  const sameDay = draft.to === "" ? null : fromWallClock({ date, time: draft.to, tz: zone });
  const faults: Faults = {
    from: startAt === null ? "day.badTime" : null,
    label: draft.label.trim() === "" ? "day.whatMissing" : null,
    to: toFault(draft, target, { sameDay, startAt, zone }),
  };
  if (startAt === null || faults.to !== null) {
    return { faults, range: null };
  }
  return {
    faults,
    range: { endAt: sameDay === null ? null : endOf(sameDay, startAt, zone), startAt },
  };
};

type Read = { readonly range: ActivityRange | null; readonly faults: Faults };

/** A block is what already happened: a start or an end after now is said under its field. */
const notAhead = (read: Read, now: string): Read => {
  const { range } = read;
  if (range === null) {
    return read;
  }
  const isStartAhead = Date.parse(range.startAt) > Date.parse(now);
  const isEndAhead = range.endAt !== null && Date.parse(range.endAt) > Date.parse(now);
  return isStartAhead || isEndAhead
    ? {
        faults: {
          ...read.faults,
          ...(isStartAhead && { from: "day.ahead" }),
          ...(isEndAhead && { to: "day.ahead" }),
        },
        range: null,
      }
    : read;
};

const hasFault = (faults: Faults): boolean =>
  faults.label !== null || faults.from !== null || faults.to !== null;

const CategoryPicker = ({
  onChange,
  value,
}: {
  readonly value: ActivityCategory;
  readonly onChange: (category: ActivityCategory) => void;
}) => {
  const t = useT();
  return (
    <View className="gap-1.5">
      <Text className="font-sans text-[12px] text-muted">{t("editor.category")}</Text>
      <View accessibilityLabel={t("editor.category")} className="flex-row flex-wrap gap-1.5">
        {ACTIVITY_CATEGORIES.map((category) => (
          <Chip
            color={CATEGORY_COLORS[category]}
            key={category}
            onPress={() => {
              onChange(category);
            }}
            selected={category === value}
          >
            {t(`category.${category}`)}
          </Chip>
        ))}
      </View>
    </View>
  );
};

/** What it was, its category and its boundaries (the end only once it has one). */
const ActivityFields = ({
  draft,
  faults,
  isEndEditable,
  patch,
}: FormPartProps<Draft> & {
  readonly faults: Faults | null;
  readonly isEndEditable: boolean;
}) => {
  const t = useT();
  const said = (key: MessageKey | null | undefined): null | string =>
    key === null || key === undefined ? null : t(key);
  const toFieldRef = useRef<TextInput>(null);
  return (
    <>
      <TextField
        error={said(faults?.label)}
        label={t("day.what")}
        maxLength={80}
        onChangeText={(label) => {
          patch({ label });
        }}
        value={draft.label}
      />
      <CategoryPicker
        onChange={(category) => {
          patch({ category });
        }}
        value={draft.category}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            error={said(faults?.from)}
            keyboardType="number-pad"
            label={t("day.from")}
            maxLength={5}
            onChangeText={(from) => {
              // Digits only: the colon comes by itself, and the end takes over after the minutes.
              const typed = typeTime(from);
              patch({ from: typed.text });
              if (typed.isComplete) {
                toFieldRef.current?.focus();
              }
            }}
            placeholder="09:00"
            value={draft.from}
          />
        </View>
        {isEndEditable ? (
          <View className="flex-1">
            <TextField
              error={said(faults?.to)}
              keyboardType="number-pad"
              label={t("day.to")}
              maxLength={5}
              onChangeText={(to) => {
                patch({ to: typeTime(to).text });
              }}
              placeholder="10:30"
              ref={toFieldRef}
              value={draft.to}
            />
          </View>
        ) : null}
      </View>
    </>
  );
};

/** Takes the block off the day after a second tap (History brings it back). */
const DeleteBlock = ({
  activityId,
  onDeleted,
}: {
  readonly activityId: string;
  readonly onDeleted: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const [isArmed, setIsArmed] = useState(false);
  return (
    <Button
      onPress={() => {
        if (!isArmed) {
          setIsArmed(true);
          return;
        }
        void (async () => {
          if (await run(actions.deleteActivity(activityId))) {
            onDeleted();
          }
        })();
      }}
      variant="ghost"
    >
      {t(isArmed ? "day.deleteConfirm" : "day.delete")}
    </Button>
  );
};

/** Log a past block, or move and rename one already on the day. */
export const ActivitySheet = ({ onClose, target, zone }: ActivitySheetProps) => {
  const t = useT();
  const { actions } = usePace();
  const language = useLanguage();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => activityFormOf(target, (atIso) => clockTime(atIso, zone)));
  const [hasTriedToSave, setHasTriedToSave] = useState(false);
  const { now } = useViewer();
  const { faults, range } = notAhead(readDraft(draft, target, zone), now);
  const save = async (): Promise<void> => {
    setHasTriedToSave(true);
    if (range === null || hasFault(faults)) {
      return;
    }
    const isSaved = await run(
      actions.saveActivity(target, { category: draft.category, label: draft.label, ...range }),
    );
    if (isSaved) {
      onClose();
    }
  };
  return (
    <Sheet
      closeLabel={t("common.close")}
      onClose={onClose}
      // The block's day, taken from the day on screen: only the times are typed.
      subtitle={formatEyebrow(target.startAt, zone, language)}
      title={t(target.kind === "edit" ? "day.editTitle" : "day.logPast")}
      visible
    >
      {/* Said under each field once a save was tried, and gone as soon as it reads right. */}
      <ActivityFields
        draft={draft}
        faults={hasTriedToSave ? faults : null}
        isEndEditable={hasEnd(target)}
        patch={patch}
      />
      <SheetActions
        cancelLabel={t("common.cancel")}
        onCancel={onClose}
        onPrimary={() => {
          void save();
        }}
        primaryLabel={t("common.save")}
      />
      {target.kind === "edit" ? (
        <DeleteBlock activityId={target.activityId} onDeleted={onClose} />
      ) : null}
    </Sheet>
  );
};
