import { useRef } from "react";
import { Text, View } from "react-native";

import type { DeadlinePolicy } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import { DateChip, DatePanel, type Zoned } from "./date-field.tsx";
import { useOutsidePress } from "./use-outside-press.ts";

type Resubmission = Extract<DeadlinePolicy, { readonly kind: "resubmission" }>;
type FinalMode = "fixed" | "none" | "offset";

const OFFSET: Resubmission = {
  finalAt: null,
  finalMode: "offset",
  finalTz: null,
  kind: "resubmission",
  softDays: 7,
};

const finalModeOf = (policy: Resubmission): FinalMode => {
  if (policy.finalMode !== undefined) {
    return policy.finalMode;
  }
  return policy.finalAt === null ? "none" : "fixed";
};

const finalDateOf = (policy: Resubmission): Zoned =>
  policy.finalAt === null || policy.finalTz === null
    ? null
    : { at: policy.finalAt, tz: policy.finalTz };

const FixedDate = ({
  isOpen,
  onChange,
  onOpenChange,
  value,
}: {
  readonly isOpen: boolean;
  readonly onChange: (value: Resubmission) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly value: Resubmission;
}) => {
  const wrapperRef = useRef<View>(null);
  useOutsidePress(wrapperRef, isOpen, () => {
    onOpenChange(false);
  });
  const date = finalDateOf(value);
  return (
    <View
      className="gap-2"
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      ref={wrapperRef}
    >
      <DateChip
        isOpen={isOpen}
        kind="final"
        onToggle={() => {
          onOpenChange(!isOpen);
        }}
        value={date}
      />
      {isOpen ? (
        <DatePanel
          kind="final"
          onChange={(picked) => {
            onChange({
              ...value,
              finalMode: "fixed",
              finalAt: picked?.at ?? null,
              finalTz: picked?.tz ?? null,
            });
          }}
          onClose={() => {
            onOpenChange(false);
          }}
          value={date}
        />
      ) : null}
    </View>
  );
};

const TwoStageFields = ({
  isFinalOpen,
  onChange,
  onFinalOpenChange,
  value,
}: {
  readonly isFinalOpen: boolean;
  readonly onChange: (value: DeadlinePolicy) => void;
  readonly onFinalOpenChange: (isOpen: boolean) => void;
  readonly value: Resubmission;
}) => {
  const t = useT();
  const mode = finalModeOf(value);
  return (
    <View className="gap-2 pl-2">
      <Text className="font-sans text-[12px] leading-5 text-muted">
        {t("form.deadlineSoftHint")}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {mode === "none" ? (
          <Chip
            onPress={() => {
              onChange(OFFSET);
            }}
            selected
          >
            {t("form.finalNotSet")}
          </Chip>
        ) : null}
        <Chip
          onPress={() => {
            onChange({ ...OFFSET, softDays: value.softDays });
          }}
          selected={mode === "offset"}
        >
          {t("form.finalAfterDays")}
        </Chip>
        <Chip
          onPress={() => {
            onChange({ ...value, finalMode: "fixed" });
          }}
          selected={mode === "fixed"}
        >
          {t("form.finalOnDate")}
        </Chip>
      </View>
      {mode === "offset" ? (
        <TextField
          inputMode="numeric"
          label={t("form.finalDays")}
          maxLength={3}
          onChangeText={(raw) => {
            const days = Number(raw);
            if (/^\d{0,3}$/u.test(raw) && Number.isSafeInteger(days)) {
              onChange({ ...OFFSET, softDays: days });
            }
          }}
          value={String(value.softDays)}
        />
      ) : null}
      {mode === "fixed" ? (
        <FixedDate
          isOpen={isFinalOpen}
          onChange={onChange}
          onOpenChange={onFinalOpenChange}
          value={value}
        />
      ) : null}
    </View>
  );
};

/** The main due stays soft when there is a second, hard deadline. */
export const DeadlinePolicyField = ({
  isFinalOpen,
  onChange,
  onFinalOpenChange,
  value,
}: {
  readonly isFinalOpen: boolean;
  readonly value: DeadlinePolicy;
  readonly onChange: (value: DeadlinePolicy) => void;
  readonly onFinalOpenChange: (isOpen: boolean) => void;
}) => {
  const t = useT();
  return (
    <View className="gap-2">
      <Text className="font-sans text-[12px] text-muted">{t("form.deadlinePolicy")}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        <Chip
          onPress={() => {
            onChange({ kind: "hard" });
          }}
          selected={value.kind === "hard"}
        >
          {t("form.deadlineHard")}
        </Chip>
        <Chip
          onPress={() => {
            onChange(OFFSET);
          }}
          selected={value.kind === "resubmission"}
        >
          {t("form.deadlineTwoStage")}
        </Chip>
      </View>
      {value.kind === "resubmission" ? (
        <TwoStageFields
          isFinalOpen={isFinalOpen}
          onChange={onChange}
          onFinalOpenChange={onFinalOpenChange}
          value={value}
        />
      ) : null}
    </View>
  );
};
