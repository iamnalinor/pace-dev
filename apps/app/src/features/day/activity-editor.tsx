import { useState } from "react";
import { View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { ActivityApps } from "#app/shared/activity-usage.tsx";
import { EstimateChip, EstimateOptions } from "#app/shared/task-fields/estimate-field.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { activityFormOf, type ActivitySheetProps, hasEnd, readTime } from "@pace/client";
import { useDraft } from "@pace/client/react";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  CATEGORY_HUES,
  formatDaySpan,
  type MessageKey,
} from "@pace/core";

import { type Faults, hasFault, notAhead, readDraft } from "./activity-draft.ts";
import { notOverlapping, type Overlap, overlapOf } from "./activity-overlap.ts";
import { ActivityTaskField } from "./activity-task-field.tsx";
import {
  type ActivityFieldsProps,
  ActivityTimeFields,
  type TimeSide,
} from "./activity-time-fields.tsx";
import { DayChoices } from "./day-choices.tsx";

const CategoryPicker = ({
  onChange,
  value,
}: {
  readonly value: ActivityCategory;
  readonly onChange: (category: ActivityCategory) => void;
}) => {
  const t = useT();
  return (
    <RadioChips
      choices={ACTIVITY_CATEGORIES.map((category) => ({
        color: CATEGORY_HUES[category],
        text: t(`category.${category}`),
        value: category,
      }))}
      label={t("editor.category")}
      onChange={onChange}
      value={value}
    />
  );
};

const ActivityFields = ({
  draft,
  faults,
  isEndEditable,
  onLeave,
  patch,
  yieldHint,
}: ActivityFieldsProps) => {
  const t = useT();
  const said = (key: MessageKey | null | undefined): null | string =>
    key === null || key === undefined ? null : t(key);
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
          patch(
            draft.label.trim() === ""
              ? { category, label: t(`category.${category}`) }
              : { category },
          );
        }}
        value={draft.category}
      />
      <ActivityEstimate
        minutes={draft.expectMinutes}
        onChange={(expectMinutes) => {
          patch({ expectMinutes });
        }}
      />
      <ActivityTaskField
        onChange={(taskId) => {
          patch({ taskId });
        }}
        value={draft.taskId}
      />
      <ActivityTimeFields
        draft={draft}
        faults={faults}
        isEndEditable={isEndEditable}
        onLeave={onLeave}
        patch={patch}
        yieldHint={yieldHint}
      />
    </>
  );
};

const ActivityEstimate = ({
  minutes,
  onChange,
}: {
  readonly minutes: null | number;
  readonly onChange: (minutes: null | number) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <View className="gap-2">
      <EstimateChip
        isOpen={isOpen}
        minutes={minutes}
        onToggle={() => {
          setIsOpen(!isOpen);
        }}
      />
      {isOpen ? (
        <EstimateOptions
          minutes={minutes}
          onEstimate={(value) => {
            onChange(value);
            setIsOpen(false);
          }}
        />
      ) : null}
    </View>
  );
};

/** Takes the activity off the day after a second tap (History brings it back). */
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
          const deletion = await run(actions.deleteActivity(activityId));
          if (deletion.ok) {
            onDeleted();
          }
        })();
      }}
      variant="plainDanger"
    >
      {t(isArmed ? "day.deleteConfirm" : "day.delete")}
    </Button>
  );
};

/** The faults of the time fields that were left; nothing else is said before a save. */
const leftFaults = (faults: Faults, left: ReadonlySet<TimeSide>): Faults => ({
  from: left.has("from") ? faults.from : null,
  label: null,
  to: left.has("to") ? faults.to : null,
});

/** What a new block takes from the blocks it lands on, in words: the one it removes, the one it cuts. */
const yieldHintOf = (t: ReturnType<typeof useT>, overlap: null | Overlap): null | string => {
  if (overlap === null) {
    return null;
  }
  const { removes, yieldsFrom } = overlap;
  const said = [
    removes === null ? null : t("day.removes", { label: removes }),
    yieldsFrom === null ? null : t("day.yieldsFrom", { label: yieldsFrom }),
  ].filter((line) => line !== null);
  return said.length === 0 ? null : said.join(" ");
};

/** The editor's state for one block (or a new past one): the draft, what reads wrong, and Save. */
export const useActivityEditor = ({ onClose, target, zone }: ActivitySheetProps) => {
  const t = useT();
  const { actions } = usePace();
  const language = useLanguage();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => activityFormOf(target, (atIso) => clockTime(atIso, zone)));
  const [hasTriedToSave, setHasTriedToSave] = useState(false);
  const [left, setLeft] = useState<ReadonlySet<TimeSide>>(() => new Set());
  const { now } = useViewer();
  const read = notAhead(readDraft(draft, target, zone), { now, zone });
  const time = useAppState((state) => state.time);
  const overlap = read.range === null ? null : overlapOf(time, { now, range: read.range, target });
  const { faults, range } = overlap === null ? read : notOverlapping(read, overlap, hasEnd(target));
  const save = async (): Promise<void> => {
    setHasTriedToSave(true);
    if (range === null || hasFault(faults)) {
      return;
    }
    const saved = await run(
      actions.saveActivity(target, {
        category: draft.category,
        expectMinutes: draft.expectMinutes,
        label: draft.label,
        taskId: draft.taskId,
        ...range,
      }),
    );
    if (saved.ok) {
      onClose();
    }
  };
  return {
    draft,
    // Every fault once a save was tried; before it, a time field's own once it was left, as every
    // other time field says it (QA round 27 R27-04).
    faults: hasTriedToSave ? faults : leftFaults(faults, left),
    leave: (side: TimeSide): void => {
      const read = readTime(draft[side]);
      if (read.isComplete && read.text !== draft[side]) {
        patch(side === "from" ? { from: read.text } : { to: read.text });
      }
      setLeft((before) => new Set(before).add(side));
    },
    patch,
    range,
    save,
    yieldHint: yieldHintOf(t, overlap),
    // Only the times are typed, so the days they fall on are named here: both for a night, and
    // as typed once the times read right (a retyped end moves near where it was).
    subtitle: formatDaySpan(range ?? target, zone, language),
  };
};

/** The editor's fields, day choices, the apps used meanwhile and Delete, in a sheet or the inspector. */
export const ActivityEditorBody = ({
  editor,
  onClose,
  target,
  zone,
}: ActivitySheetProps & {
  readonly editor: ReturnType<typeof useActivityEditor>;
}) => (
  <>
    {/* Said under each field once a save was tried, and gone as soon as it reads right. */}
    <ActivityFields
      draft={editor.draft}
      faults={editor.faults}
      isEndEditable={hasEnd(target)}
      onLeave={editor.leave}
      patch={editor.patch}
      yieldHint={editor.yieldHint}
    />
    <DayChoices
      draft={editor.draft}
      patch={editor.patch}
      range={editor.range}
      target={target}
      zone={zone}
    />
    {target.kind === "edit" ? (
      <ActivityApps endAt={target.endAt} startAt={target.startAt} zone={zone} />
    ) : null}
    {target.kind === "edit" ? (
      <DeleteBlock activityId={target.activityId} onDeleted={onClose} />
    ) : null}
  </>
);
