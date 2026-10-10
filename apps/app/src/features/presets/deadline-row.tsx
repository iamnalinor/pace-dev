import { useState } from "react";
import { Text, View } from "react-native";

import type { DeadlinePolicy } from "@pace/core";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { fromWallClock, wallClock } from "#app/format/time.ts";
import { TextField } from "#app/ui/text-field.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";
import { isOverridden, setValue, toggleOverride } from "@pace/client";

import type { SectionProps } from "./rows.tsx";

import { ChoiceChips } from "./choice-chips.tsx";
import { NumberInput } from "./number-input.tsx";
import { OverrideRow } from "./override-row.tsx";

/** Late work counts for a week by default; no final deadline until one is set. */
const RESUBMISSION: DeadlinePolicy = {
  finalAt: null,
  finalTz: null,
  kind: "resubmission",
  softDays: 7,
};

const KINDS: readonly DeadlinePolicy["kind"][] = ["hard", "resubmission"];

type Resubmission = Extract<DeadlinePolicy, { readonly kind: "resubmission" }>;

/** The final date as a typed date and a time on the zone's wall clock; an empty date clears it. */
const FinalAt = ({
  onPolicy,
  policy,
  zone,
}: {
  readonly policy: Resubmission;
  readonly zone: string;
  readonly onPolicy: (policy: DeadlinePolicy) => void;
}) => {
  const t = useT();
  const shown =
    policy.finalAt === null ? { date: "", time: "23:59" } : wallClock(policy.finalAt, zone);
  const [date, setDate] = useState(shown.date);
  const save = (next: { readonly date: string; readonly time: string }): void => {
    if (next.date.trim() === "") {
      onPolicy({ ...policy, finalAt: null, finalTz: null });
      return;
    }
    const finalAt = fromWallClock({ ...next, tz: zone });
    if (finalAt !== null) {
      onPolicy({ ...policy, finalAt, finalTz: zone });
    }
  };
  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">
        <TextField
          inputMode="numeric"
          label={t("presets.finalAt")}
          onChangeText={(next) => {
            setDate(next);
            save({ date: next, time: shown.time });
          }}
          placeholder="2026-12-20"
          value={date}
        />
      </View>
      <TimeInput
        className="w-24"
        label={t("presets.finalAt")}
        onTime={(time) => {
          save({ date, time });
        }}
        value={shown.time}
      />
    </View>
  );
};

const ResubmissionFields = ({
  onPolicy,
  policy,
}: {
  readonly policy: Resubmission;
  readonly onPolicy: (policy: DeadlinePolicy) => void;
}) => {
  const t = useT();
  const { timezone } = useSettings();
  const { deviceTz } = usePace().hooks.useClock();
  const zone = policy.finalTz ?? timezone ?? deviceTz;
  return (
    <View className="gap-2 pl-3 pt-2">
      <Text className="font-sans text-[12px] text-muted">{t("presets.softDays")}</Text>
      <NumberInput
        label={t("presets.softDays")}
        onChange={(softDays) => {
          onPolicy({ ...policy, softDays });
        }}
        placeholder="7"
        value={policy.softDays}
      />
      <FinalAt onPolicy={onPolicy} policy={policy} zone={zone} />
      <Text className="font-sans text-[12px] tabular-nums text-muted">
        {t("add.dueZone", { tz: zone })}
      </Text>
    </View>
  );
};

/** Hard deadline, or resubmission with soft days and an optional final date in its zone. */
export const DeadlineRow = (section: SectionProps) => {
  const t = useT();
  const { definition, inherited, onChange } = section;
  const policy = definition.deadlinePolicy ?? inherited.deadlinePolicy;
  const onPolicy = (next: DeadlinePolicy): void => {
    onChange(setValue(definition, "deadlinePolicy", next));
  };
  return (
    <OverrideRow
      inheritedHint={section.inheritedHint}
      invalid={section.issues.has("deadlinePolicy")}
      isOverridden={isOverridden(definition, "deadlinePolicy")}
      label={t("presets.field.deadlinePolicy")}
      onToggle={() => {
        onChange(toggleOverride(definition, "deadlinePolicy", inherited));
      }}
    >
      {() => (
        <>
          <ChoiceChips
            label={t("presets.field.deadlinePolicy")}
            labelOf={(kind) => t(`presets.deadline.${kind}`)}
            onChange={(kind) => {
              onPolicy(kind === "hard" ? { kind: "hard" } : RESUBMISSION);
            }}
            value={policy.kind}
            values={KINDS}
          />
          {policy.kind === "resubmission" ? (
            <ResubmissionFields onPolicy={onPolicy} policy={policy} />
          ) : null}
        </>
      )}
    </OverrideRow>
  );
};
