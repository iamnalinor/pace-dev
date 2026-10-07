import { useId } from "react";

import type { DeadlinePolicy } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";

import type { SectionProps } from "./rows.tsx";

import { CONTROL_CLASS } from "./control-class.ts";
import { NumberInput } from "./number-input.tsx";
import { OverrideRow } from "./override-row.tsx";
import { isOverridden, setValue, toggleOverride } from "./preset-draft.ts";

/** Late work counts for a week by default; no final deadline until one is set. */
const RESUBMISSION: DeadlinePolicy = {
  finalAt: null,
  finalTz: null,
  kind: "resubmission",
  softDays: 7,
};

type Resubmission = Extract<DeadlinePolicy, { readonly kind: "resubmission" }>;

const ResubmissionFields = ({
  disabled,
  onPolicy,
  policy,
}: {
  readonly policy: Resubmission;
  readonly disabled: boolean;
  readonly onPolicy: (policy: DeadlinePolicy) => void;
}) => {
  const t = useT();
  const id = useId();
  const { hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { deviceTz } = hooks.useClock();
  const zone = policy.finalTz ?? timezone ?? deviceTz;
  return (
    <div className="grid gap-2 pl-3">
      <label className="text-xs text-muted" htmlFor={`${id}-soft`}>
        {t("presets.softDays")}
      </label>
      <NumberInput
        disabled={disabled}
        id={`${id}-soft`}
        invalid={false}
        onChange={(softDays) => {
          onPolicy({ ...policy, softDays });
        }}
        placeholder="7"
        value={policy.softDays}
      />
      <label className="text-xs text-muted" htmlFor={`${id}-final`}>
        {t("presets.finalAt")}
      </label>
      <input
        className={cn(CONTROL_CLASS, "font-mono")}
        disabled={disabled}
        id={`${id}-final`}
        onChange={(event) => {
          const finalAt =
            event.target.value === "" ? null : wallClockToIso(event.target.value, zone);
          onPolicy({ ...policy, finalAt, finalTz: finalAt === null ? null : zone });
        }}
        type="datetime-local"
        value={policy.finalAt === null ? "" : isoToWallClock(policy.finalAt, zone)}
      />
      <p className="font-mono text-xs text-muted">{t("add.dueZone", { tz: zone })}</p>
    </div>
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
      invalid={section.issues.has("deadlinePolicy")}
      isOverridden={isOverridden(definition, "deadlinePolicy")}
      label={t("presets.field.deadlinePolicy")}
      onToggle={() => {
        onChange(toggleOverride(definition, "deadlinePolicy", inherited));
      }}
      parentName={section.parentName}
    >
      {({ disabled, id, invalid }) => (
        <>
          <select
            aria-invalid={invalid}
            className={CONTROL_CLASS}
            disabled={disabled}
            id={id}
            onChange={(event) => {
              onPolicy(event.target.value === "hard" ? { kind: "hard" } : RESUBMISSION);
            }}
            value={policy.kind}
          >
            <option value="hard">{t("presets.deadline.hard")}</option>
            <option value="resubmission">{t("presets.deadline.resubmission")}</option>
          </select>
          {policy.kind === "resubmission" && (
            <ResubmissionFields disabled={disabled} onPolicy={onPolicy} policy={policy} />
          )}
        </>
      )}
    </OverrideRow>
  );
};
