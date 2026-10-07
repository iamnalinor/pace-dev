import type { ReactNode } from "react";

import { useT } from "#web/i18n.tsx";
import {
  type Importance,
  type NotifyParams,
  type PresetFields,
  type ProgressMode,
  ProjectColorSchema,
  type Submission,
  type UrgencyPolicy,
} from "@pace/core";

import { DeadlineRow } from "./deadline-row.tsx";
import { RecurrenceRow } from "./recurrence-row.tsx";
import { ChoiceRow, EstimateRow, FieldToggleRow, NotifyRow, type SectionProps } from "./rows.tsx";

const POLICIES: readonly UrgencyPolicy[] = ["pace", "lag", "age", "resubmission"];
const IMPORTANCES: readonly Importance[] = ["asap", "prioritized", "normal", "nice_to_have"];
const SUBMISSIONS: readonly Submission[] = ["per_subtask", "whole"];
const PROGRESS_MODES: readonly ProgressMode[] = ["subtasks", "slider", "none"];
const FIELD_KEYS: readonly (keyof PresetFields)[] = ["description", "link", "startAt", "submitVia"];
const NOTIFY_KEYS: readonly (keyof NotifyParams)[] = [
  "criticalHours",
  "criticalProgress",
  "criticalScore",
  "waitingDays",
  "inProgressIdleDays",
];

const Section = ({ children, title }: { readonly children: ReactNode; readonly title: string }) => (
  <section
    aria-label={title}
    className="mx-4 mt-3 rounded-xl border border-line bg-surface px-3.5 pt-1"
  >
    <h2 className="pt-2.5 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">{title}</h2>
    {children}
  </section>
);

/** The definition's sections, in the order of `PresetDefinitionSchema`. */
export const PresetSections = (section: SectionProps) => {
  const t = useT();
  return (
    <>
      <Section title={t("presets.section.urgency")}>
        <ChoiceRow
          {...section}
          field="urgencyPolicy"
          label={t("presets.field.urgencyPolicy")}
          labelOf={(value) => t(`policy.${value}`)}
          values={POLICIES}
        />
        <ChoiceRow
          {...section}
          field="defaultImportance"
          label={t("presets.field.defaultImportance")}
          labelOf={(value) => t(`importance.${value}`)}
          values={IMPORTANCES}
        />
        <DeadlineRow {...section} />
      </Section>
      <Section title={t("presets.section.work")}>
        <ChoiceRow
          {...section}
          field="submission"
          label={t("presets.field.submission")}
          labelOf={(value) => t(`submission.${value}`)}
          values={SUBMISSIONS}
        />
        <ChoiceRow
          {...section}
          field="progressMode"
          label={t("presets.field.progressMode")}
          labelOf={(value) => t(`presets.progress.${value}`)}
          values={PROGRESS_MODES}
        />
        <EstimateRow {...section} />
        <ChoiceRow
          {...section}
          field="color"
          label={t("presets.field.color")}
          labelOf={(value) => t(`color.${value}`)}
          values={ProjectColorSchema.options}
        />
      </Section>
      <Section title={t("presets.section.schedule")}>
        <RecurrenceRow {...section} />
      </Section>
      <Section title={t("presets.section.fields")}>
        {FIELD_KEYS.map((key) => (
          <FieldToggleRow
            key={key}
            {...section}
            label={t(`presets.taskField.${key}`)}
            sub={{ group: "fields", key }}
          />
        ))}
      </Section>
      <Section title={t("presets.section.notify")}>
        {NOTIFY_KEYS.map((key) => (
          <NotifyRow
            key={key}
            {...section}
            label={t(`presets.notify.${key}`)}
            sub={{ group: "notify", key }}
          />
        ))}
      </Section>
    </>
  );
};
