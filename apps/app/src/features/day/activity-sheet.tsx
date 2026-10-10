import { useRef, useState } from "react";
import { ScrollView, Text, type TextInput, View } from "react-native";

import { useLanguage, usePace, useT } from "#app/app-state.tsx";
import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
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
} from "@pace/core";

/** What the sheet edits: an existing block (move and rename) or a new past one. */
export type SheetTarget = ActivityTarget;

type Draft = ActivityForm;

/**
The typed clock times on the block's own day; an end at or before the start means the block
ran past midnight.
*/
const rangeOf = (draft: Draft, target: SheetTarget, zone: string): ActivityRange | null => {
  const { date } = wallClock(target.startAt, zone);
  const startAt = fromWallClock({ date, time: draft.from, tz: zone });
  if (startAt === null) {
    return null;
  }
  if (draft.to === "") {
    return target.kind === "log" ? null : { endAt: null, startAt };
  }
  const sameDay = fromWallClock({ date, time: draft.to, tz: zone });
  if (sameDay === null) {
    return null;
  }
  return { endAt: sameDay > startAt ? sameDay : addDaysIn(sameDay, 1, zone), startAt };
};

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
      <ScrollView
        accessibilityLabel={t("editor.category")}
        contentContainerClassName="gap-1.5"
        horizontal
      >
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
      </ScrollView>
    </View>
  );
};

/** What it was, its category and its boundaries (the end only once it has one). */
const ActivityFields = ({
  draft,
  error,
  isEndEditable,
  patch,
}: FormPartProps<Draft> & {
  readonly error: null | string;
  readonly isEndEditable: boolean;
}) => {
  const t = useT();
  const toFieldRef = useRef<TextInput>(null);
  return (
    <>
      <TextField
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
            error={error}
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

/** Log a past block, or move and rename one already on the day. */
export const ActivitySheet = ({ onClose, target, zone }: ActivitySheetProps) => {
  const t = useT();
  const { actions } = usePace();
  const language = useLanguage();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => activityFormOf(target, (atIso) => clockTime(atIso, zone)));
  const [hasTriedToSave, setHasTriedToSave] = useState(false);
  const range = rangeOf(draft, target, zone);
  // Said once a save was tried, and gone as soon as the times read right.
  const error = hasTriedToSave && range === null ? t("day.badRange") : null;
  const save = async (): Promise<void> => {
    setHasTriedToSave(true);
    if (range === null) {
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
      <ActivityFields draft={draft} error={error} isEndEditable={hasEnd(target)} patch={patch} />
      <SheetActions
        cancelLabel={t("common.cancel")}
        onCancel={onClose}
        onPrimary={() => {
          void save();
        }}
        primaryLabel={t("common.save")}
      />
    </Sheet>
  );
};
