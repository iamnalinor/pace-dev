import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { ActivityApps } from "#app/shared/activity-usage.tsx";
import { EstimateChip, EstimateOptions } from "#app/shared/task-fields/estimate-field.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { TIME_MAX_LENGTH } from "#app/ui/time-input.tsx";
import {
  type ActivityForm,
  activityFormOf,
  type ActivitySheetProps,
  type FormPartProps,
  hasEnd,
  typeTime,
} from "@pace/client";
import { useDraft } from "@pace/client/react";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  CATEGORY_HUES,
  formatDaySpan,
  type MessageKey,
} from "@pace/core";

import {
  type Faults,
  hasFault,
  notAhead,
  notOverlapping,
  overlapOf,
  readDraft,
} from "./activity-draft.ts";
import { ActivityTaskField } from "./activity-task-field.tsx";
import { DayChoices } from "./day-choices.tsx";

type Draft = ActivityForm;

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

type ActivityFieldsProps = FormPartProps<Draft> & {
  readonly faults: Faults | null;
  readonly isEndEditable: boolean;
  /** The live block a logged one takes its time from, said under the start. */
  readonly yieldsFrom: null | string;
};

const ActivityTimeFields = ({
  draft,
  faults,
  isEndEditable,
  patch,
  yieldsFrom,
}: ActivityFieldsProps) => {
  const t = useT();
  const toFieldRef = useRef<TextInput>(null);
  const said = (key: MessageKey | null | undefined): null | string =>
    key === null || key === undefined ? null : t(key);
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <TextField
          error={said(faults?.from)}
          {...(yieldsFrom !== null && { hint: t("day.yieldsFrom", { label: yieldsFrom }) })}
          keyboardType="number-pad"
          label={t("day.from")}
          maxLength={TIME_MAX_LENGTH}
          onChangeText={(from) => {
            const typed = typeTime(from, draft.from);
            patch({ from: typed.text });
            // On to the end only when the last minute digit was just typed at the end: a time
            // finished in the middle of an edit keeps the caret where the person is working.
            if (typed.isComplete && typed.text.startsWith(draft.from) && draft.from.length === 4) {
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
            maxLength={TIME_MAX_LENGTH}
            onChangeText={(to) => {
              patch({ to: typeTime(to, draft.to).text });
            }}
            placeholder="10:30"
            ref={toFieldRef}
            value={draft.to}
          />
        </View>
      ) : null}
    </View>
  );
};

/** What it was, its category and its boundaries (the end only once it has one). */
const ActivityFields = ({
  draft,
  faults,
  isEndEditable,
  patch,
  yieldsFrom,
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
        patch={patch}
        yieldsFrom={yieldsFrom}
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

/** The editor's state for one block (or a new past one): the draft, what reads wrong, and Save. */
export const useActivityEditor = ({ onClose, target, zone }: ActivitySheetProps) => {
  const { actions } = usePace();
  const language = useLanguage();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => activityFormOf(target, (atIso) => clockTime(atIso, zone)));
  const [hasTriedToSave, setHasTriedToSave] = useState(false);
  const { now } = useViewer();
  const read = notAhead(readDraft(draft, target, zone), now);
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
    faults: hasTriedToSave ? faults : null,
    patch,
    range,
    save,
    yieldsFrom: overlap?.yieldsFrom ?? null,
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
      patch={editor.patch}
      yieldsFrom={editor.yieldsFrom}
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
