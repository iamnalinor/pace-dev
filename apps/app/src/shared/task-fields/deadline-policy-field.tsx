import { useRef } from "react";
import { Text, View } from "react-native";

import type { DeadlinePolicy } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import { DateChip, DatePanel, type Zoned } from "./date-field.tsx";

type Resubmission = Extract<DeadlinePolicy, { readonly kind: "resubmission" }>;
type FinalMode = "fixed" | "none" | "offset";

/** The final deadline's modes, "not set" first while it is the one chosen. */
const FINAL_MODES: readonly FinalMode[] = ["none", "offset", "fixed"];
const SET_FINAL_MODES: readonly FinalMode[] = ["offset", "fixed"];
const POLICY_KINDS: readonly DeadlinePolicy["kind"][] = ["hard", "resubmission"];

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
  const t = useT();
  const wrapperRef = useRef<View>(null);
  const date = finalDateOf(value);
  return (
    <View
      className="gap-2"
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      ref={wrapperRef}
    >
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("form.final")}
      </Text>
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
          region={wrapperRef}
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
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("form.deadlineSoftHint")}
      </Text>
      <RadioGroup
        className="flex-row flex-wrap gap-x-2"
        label={t("form.deadlineSoftHint")}
        onChange={(next: FinalMode) => {
          if (next === "none") {
            onChange(OFFSET);
          } else if (next === "offset") {
            onChange({ ...OFFSET, softDays: value.softDays });
          } else {
            onChange({ ...value, finalMode: "fixed" });
            // No date yet: its calendar opens, so the choice is not left half made.
            if (value.finalAt === null) {
              onFinalOpenChange(true);
            }
          }
        }}
        value={mode}
        values={mode === "none" ? FINAL_MODES : SET_FINAL_MODES}
      >
        {mode === "none" ? <Chip value="none">{t("form.finalNotSet")}</Chip> : null}
        <Chip value="offset">{t("form.finalAfterDays")}</Chip>
        <Chip value="fixed">{t("form.finalOnDate")}</Chip>
      </RadioGroup>
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
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("form.deadlinePolicy")}
      </Text>
      <RadioGroup
        className="flex-row flex-wrap gap-x-2"
        label={t("form.deadlinePolicy")}
        onChange={(kind: DeadlinePolicy["kind"]) => {
          onChange(kind === "hard" ? { kind: "hard" } : OFFSET);
        }}
        value={value.kind}
        values={POLICY_KINDS}
      >
        <Chip value="hard">{t("form.deadlineHard")}</Chip>
        <Chip value="resubmission">{t("form.deadlineTwoStage")}</Chip>
      </RadioGroup>
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
