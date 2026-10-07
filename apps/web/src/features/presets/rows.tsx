import type { PresetDefinition, ResolvedPreset } from "@pace/core";

import { useT } from "#web/i18n.tsx";

import { CONTROL_CLASS } from "./control-class.ts";
import { NumberInput } from "./number-input.tsx";
import { OverrideRow } from "./override-row.tsx";
import {
  isOverridden,
  isSubOverridden,
  setSub,
  setValue,
  type SubKey,
  toggleOverride,
  toggleSubOverride,
  type WholeKey,
} from "./preset-draft.ts";

/** What every section of the editor works on. */
export type SectionProps = {
  readonly definition: PresetDefinition;
  readonly inherited: ResolvedPreset;
  readonly parentName: string;
  readonly issues: ReadonlySet<string>;
  readonly onChange: (definition: PresetDefinition) => void;
};

type ChoiceKey = "color" | "defaultImportance" | "progressMode" | "submission" | "urgencyPolicy";

type ChoiceProps<K extends ChoiceKey> = SectionProps & {
  readonly field: K;
  readonly label: string;
  readonly values: readonly ResolvedPreset[K][];
  readonly labelOf: (value: ResolvedPreset[K]) => string;
};

/** A setting picked from a short list (policy, importance, submission, progress, color). */
export const ChoiceRow = <K extends ChoiceKey>({
  field,
  label,
  labelOf,
  values,
  ...section
}: ChoiceProps<K>) => {
  const { definition, inherited, onChange } = section;
  const current = definition[field] ?? inherited[field];
  return (
    <OverrideRow
      invalid={section.issues.has(field)}
      isOverridden={isOverridden(definition, field)}
      label={label}
      onToggle={() => {
        onChange(toggleOverride(definition, field, inherited));
      }}
      parentName={section.parentName}
    >
      {({ disabled, id, invalid }) => (
        <select
          aria-invalid={invalid}
          className={CONTROL_CLASS}
          disabled={disabled}
          id={id}
          onChange={(event) => {
            const picked = values.find((value) => value === event.target.value);
            if (picked !== undefined) {
              onChange(setValue(definition, field, picked));
            }
          }}
          value={current}
        >
          {values.map((value) => (
            <option key={value} value={value}>
              {labelOf(value)}
            </option>
          ))}
        </select>
      )}
    </OverrideRow>
  );
};

type NumberRowProps = {
  readonly label: string;
  readonly isInvalid: boolean;
  readonly isOn: boolean;
  readonly parentName: string;
  readonly onToggle: () => void;
  readonly inherited: number;
  readonly own: number | undefined;
  readonly onValue: (value: number) => void;
};

/** A number that is inherited (shown as the placeholder) until it is overridden. */
const NumberOverrideRow = (props: NumberRowProps) => (
  <OverrideRow
    invalid={props.isInvalid}
    isOverridden={props.isOn}
    label={props.label}
    onToggle={props.onToggle}
    parentName={props.parentName}
  >
    {({ disabled, id, invalid }) => (
      <NumberInput
        disabled={disabled}
        id={id}
        invalid={invalid}
        key={String(props.isOn)}
        onChange={props.onValue}
        placeholder={String(props.inherited)}
        value={props.own}
      />
    )}
  </OverrideRow>
);

/** The default estimate in minutes; the inherited figure is the placeholder. */
export const EstimateRow = (section: SectionProps) => {
  const t = useT();
  const { definition, inherited, onChange } = section;
  const key: WholeKey = "defaultEstimateMinutes";
  return (
    <NumberOverrideRow
      inherited={inherited.defaultEstimateMinutes}
      isInvalid={section.issues.has(key)}
      isOn={isOverridden(definition, key)}
      label={t("presets.field.defaultEstimateMinutes")}
      onToggle={() => {
        onChange(toggleOverride(definition, key, inherited));
      }}
      onValue={(minutes) => {
        onChange(setValue(definition, key, minutes));
      }}
      own={definition.defaultEstimateMinutes}
      parentName={section.parentName}
    />
  );
};

type SubProps = SectionProps & { readonly sub: SubKey; readonly label: string };

/** One notification threshold; each is overridden on its own. */
export const NotifyRow = ({ label, sub, ...section }: SubProps) => {
  const { definition, inherited, onChange } = section;
  return (
    <NumberOverrideRow
      inherited={sub.group === "notify" ? inherited.notify[sub.key] : 0}
      isInvalid={section.issues.has(`${sub.group}.${sub.key}`)}
      isOn={isSubOverridden(definition, sub)}
      label={label}
      onToggle={() => {
        onChange(toggleSubOverride(definition, sub, inherited));
      }}
      onValue={(value) => {
        onChange(setSub(definition, sub, value));
      }}
      own={sub.group === "notify" ? definition.notify?.[sub.key] : undefined}
      parentName={section.parentName}
    />
  );
};

/** Whether the task form shows an optional field (link, description, start, submit via). */
export const FieldToggleRow = ({ label, sub, ...section }: SubProps) => {
  const t = useT();
  const { definition, inherited, onChange } = section;
  const own = sub.group === "fields" ? definition.fields?.[sub.key] : undefined;
  const isShown = own ?? (sub.group === "fields" && inherited.fields[sub.key]);
  return (
    <OverrideRow
      isOverridden={isSubOverridden(definition, sub)}
      label={label}
      labelsControl={false}
      onToggle={() => {
        onChange(toggleSubOverride(definition, sub, inherited));
      }}
      parentName={section.parentName}
    >
      {({ disabled }) => (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            checked={isShown}
            className="size-4 accent-accent"
            disabled={disabled}
            onChange={(event) => {
              onChange(setSub(definition, sub, event.target.checked));
            }}
            type="checkbox"
          />
          {t("presets.showField", { field: label })}
        </label>
      )}
    </OverrideRow>
  );
};
