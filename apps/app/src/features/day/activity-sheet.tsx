import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  type ActivityForm,
  activityFormOf,
  type ActivitySheetProps,
  type ActivityTarget,
  hasEnd,
} from "@pace/client";
import { useDraft } from "@pace/client/react";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Chip } from "#app/ui/chip.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { ACTIVITY_CATEGORIES, type ActivityCategory, addDaysIn, CATEGORY_COLORS } from "@pace/core";

/** What the sheet edits: an existing block (move and rename) or a new past one. */
export type SheetTarget = ActivityTarget;

type Draft = ActivityForm;

type Range = { readonly startAt: string; readonly endAt: null | string };

/**
The typed clock times on the block's own day; an end at or before the start means the block
ran past midnight.
*/
const rangeOf = (draft: Draft, target: SheetTarget, zone: string): null | Range => {
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
}: {
  readonly draft: Draft;
  readonly error: null | string;
  readonly isEndEditable: boolean;
  readonly patch: (next: Partial<Draft>) => void;
}) => {
  const t = useT();
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
            keyboardType="numbers-and-punctuation"
            label={t("day.from")}
            maxLength={5}
            onChangeText={(from) => {
              patch({ from });
            }}
            placeholder="09:00"
            value={draft.from}
          />
        </View>
        {isEndEditable ? (
          <View className="flex-1">
            <TextField
              keyboardType="numbers-and-punctuation"
              label={t("day.to")}
              maxLength={5}
              onChangeText={(to) => {
                patch({ to });
              }}
              placeholder="10:30"
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
  const [error, setError] = useState<null | string>(null);
  const { actions } = usePace();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => activityFormOf(target, (atIso) => clockTime(atIso, zone)));
  const save = async (): Promise<void> => {
    const range = rangeOf(draft, target, zone);
    if (range === null) {
      setError(t("day.badRange"));
      return;
    }
    if (
      await run(
        actions.saveActivity(target, { category: draft.category, label: draft.label, ...range }),
      )
    ) {
      onClose();
    }
  };
  return (
    <Sheet
      closeLabel={t("common.close")}
      onClose={onClose}
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
