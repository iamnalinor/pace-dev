import { useRef, useState } from "react";
import { Text, type TextInput, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
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
  CATEGORY_COLORS,
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
  const nextStart = useAppState((state) => nextStartOf(state.time, target));
  const { faults, range } = notIntoNext(notAhead(readDraft(draft, target, zone), now), nextStart);
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
