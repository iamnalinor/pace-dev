import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { type Importance, resolvePreset } from "@pace/core";

import type { AddDraft } from "./add-draft.ts";

import { DueField } from "./due-field.tsx";
import { EstimateBuckets } from "./estimate-buckets.tsx";
import { Field, GroupRow } from "./field.tsx";
import { INPUT_CLASS } from "./input-class.ts";
import { ProblemChips } from "./problem-chips.tsx";

type Props = {
  readonly draft: AddDraft;
  readonly zone: string;
  readonly onPatch: (patch: Partial<AddDraft>) => void;
};

const IMPORTANCES: readonly Importance[] = ["asap", "prioritized", "normal", "nice_to_have"];

const TextRow = ({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) => (
  <Field label={label}>
    {(id) => (
      <input
        className={cn(INPUT_CLASS, "h-11")}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      />
    )}
  </Field>
);

/** Project (any name; a new one is made on the fly), due with its zone, importance. */
export const PlanFields = ({ draft, onPatch, zone }: Props) => {
  const t = useT();
  const projects = useServices().hooks.useAppState((state) => state.projects);
  const names = Object.values(projects.byId)
    .filter((project) => !project.archived)
    .map((project) => project.name)
    .toSorted((a, b) => a.localeCompare(b));
  return (
    <>
      <Field label={t("add.project")}>
        {(id) => (
          <>
            <input
              className={cn(INPUT_CLASS, "h-11")}
              id={id}
              list={`${id}-names`}
              onChange={(event) => {
                onPatch({ projectName: event.target.value });
              }}
              placeholder={t("add.projectPlaceholder")}
              value={draft.projectName}
            />
            <datalist id={`${id}-names`}>
              {names.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <GroupRow label={t("add.due")}>
        <DueField
          onChange={(due) => {
            onPatch({ due });
          }}
          onZone={(dueTz) => {
            onPatch({ dueTz });
          }}
          value={draft.due}
          zone={zone}
        />
      </GroupRow>
      <Field label={t("add.importance")}>
        {(id) => (
          <select
            className={cn(INPUT_CLASS, "h-11")}
            id={id}
            onChange={(event) => {
              const value = IMPORTANCES.find((importance) => importance === event.target.value);
              onPatch({ importance: value ?? "default" });
            }}
            value={draft.importance}
          >
            <option value="default">{t("add.presetDefault")}</option>
            {IMPORTANCES.map((importance) => (
              <option key={importance} value={importance}>
                {t(`importance.${importance}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  );
};

/** Estimate buckets, problems, and the details the preset's fields ask for. */
export const WorkFields = ({ draft, onPatch }: Omit<Props, "zone">) => {
  const t = useT();
  const { actions, hooks } = useServices();
  const presets = hooks.useAppState((state) => state.presets);
  const resolved = resolvePreset(presets, draft.presetId);
  const fields = resolved.ok ? resolved.value.fields : undefined;
  return (
    <>
      <GroupRow label={t("add.estimate")}>
        <EstimateBuckets
          buckets={actions.estimateHints(draft.presetId)}
          onChange={(estimate) => {
            onPatch({ estimate });
          }}
          value={draft.estimate}
        />
      </GroupRow>
      <GroupRow label={t("add.problems")}>
        <ProblemChips
          onChange={(problems) => {
            onPatch({ problems });
          }}
          problems={draft.problems}
        />
      </GroupRow>
      <Field label={t("add.description")}>
        {(id) => (
          <textarea
            className={cn(INPUT_CLASS, "min-h-16 py-2")}
            id={id}
            onChange={(event) => {
              onPatch({ description: event.target.value });
            }}
            value={draft.description}
          />
        )}
      </Field>
      {fields?.ticket === true && (
        <TextRow
          label={t("add.ticket")}
          onChange={(ticket) => {
            onPatch({ ticket });
          }}
          value={draft.ticket}
        />
      )}
      {fields?.submitVia === true && (
        <TextRow
          label={t("add.submitVia")}
          onChange={(submitVia) => {
            onPatch({ submitVia });
          }}
          value={draft.submitVia}
        />
      )}
    </>
  );
};
