import { useRef, useState } from "react";
import { Text, type TextInput, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { ActivityApps } from "#app/shared/activity-usage.tsx";
import { EstimateChip, EstimateOptions } from "#app/shared/task-fields/estimate-field.tsx";
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
  CATEGORY_HUES,
  formatEyebrow,
  type MessageKey,
} from "@pace/core";

import {
  type Faults,
  hasFault,
  nextStartOf,
  notAhead,
  notIntoNext,
  readDraft,
} from "./activity-draft.ts";
import { ActivityTaskField } from "./activity-task-field.tsx";

/** What the sheet edits: an existing block (move and rename) or a new past one. */
export type SheetTarget = ActivityTarget;

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
    <View className="gap-2">
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("editor.category")}
      </Text>
      <View accessibilityLabel={t("editor.category")} className="flex-row flex-wrap gap-2">
        {ACTIVITY_CATEGORIES.map((category) => (
          <Chip
            color={CATEGORY_HUES[category]}
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

type ActivityFieldsProps = FormPartProps<Draft> & {
  readonly faults: Faults | null;
  readonly isEndEditable: boolean;
};

const ActivityTimeFields = ({ draft, faults, isEndEditable, patch }: ActivityFieldsProps) => {
  const t = useT();
  const toFieldRef = useRef<TextInput>(null);
  const said = (key: MessageKey | null | undefined): null | string =>
    key === null || key === undefined ? null : t(key);
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <TextField
          error={said(faults?.from)}
          keyboardType="number-pad"
          label={t("day.from")}
          maxLength={5}
          onChangeText={(from) => {
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
  );
};

/** What it was, its category and its boundaries (the end only once it has one). */
const ActivityFields = ({ draft, faults, isEndEditable, patch }: ActivityFieldsProps) => {
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
  const nextStart = useAppState((state) => nextStartOf(state.time, target));
  const { faults, range } = notIntoNext(notAhead(readDraft(draft, target, zone), now), nextStart);
  const save = async (): Promise<void> => {
    setHasTriedToSave(true);
    if (range === null || hasFault(faults)) {
      return;
    }
    const isSaved = await run(
      actions.saveActivity(target, {
        category: draft.category,
        expectMinutes: draft.expectMinutes,
        label: draft.label,
        taskId: draft.taskId,
        ...range,
      }),
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
      {target.kind === "edit" ? (
        <ActivityApps endAt={target.endAt} startAt={target.startAt} zone={zone} />
      ) : null}
      <SheetActions
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
