import type { PresetDefinition, ProjectColorName, ResolvedPreset } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import {
  isOverridden,
  isSubOverridden,
  setSub,
  setValue,
  type SubKey,
  toggleOverride,
  toggleSubOverride,
  type WholeKey,
} from "@pace/client";

import { ChoiceChips } from "./choice-chips.tsx";
import { NumberInput } from "./number-input.tsx";
import { OverrideRow } from "./override-row.tsx";

/** What every section of the editor works on. */
export type SectionProps = {
  readonly definition: PresetDefinition;
  readonly inherited: ResolvedPreset;
  readonly inheritedHint: string;
  readonly issues: ReadonlySet<string>;
  readonly onChange: (definition: PresetDefinition) => void;
};

type ChoiceKey = "color" | "defaultImportance" | "progressMode" | "submission" | "urgencyPolicy";

/** A setting picked from a short list (policy, importance, submission, progress, color). */
export const ChoiceRow = <K extends ChoiceKey>({
  colorOf,
  field,
  label,
  labelOf,
  values,
  ...section
}: SectionProps & {
  readonly field: K;
  readonly label: string;
  readonly values: readonly ResolvedPreset[K][];
  readonly labelOf: (value: ResolvedPreset[K]) => string;
  readonly colorOf?: (value: ResolvedPreset[K]) => ProjectColorName;
}) => {
  const { definition, inherited, onChange } = section;
  // A stored key holds the resolved type; the definition's type only adds `undefined`.
  const current = (definition[field] as ResolvedPreset[K] | undefined) ?? inherited[field];
  return (
    <OverrideRow
      inheritedHint={section.inheritedHint}
      invalid={section.issues.has(field)}
      isOverridden={isOverridden(definition, field)}
      label={label}
      onToggle={() => {
        onChange(toggleOverride(definition, field, inherited));
      }}
    >
      {() => (
        <ChoiceChips
          label={label}
          labelOf={labelOf}
          onChange={(picked) => {
            onChange(setValue(definition, field, picked));
          }}
          value={current}
          values={values}
          {...(colorOf !== undefined && { colorOf })}
        />
      )}
    </OverrideRow>
  );
};

type NumberRowProps = {
  readonly label: string;
  readonly isInvalid: boolean;
  readonly isOn: boolean;
  readonly inheritedHint: string;
  readonly onToggle: () => void;
  readonly inherited: number;
  readonly own: number | undefined;
  readonly onValue: (value: number) => void;
};

/** A number that is inherited (shown as the placeholder) until it is overridden. */
const NumberOverrideRow = (props: NumberRowProps) => (
  <OverrideRow
    inheritedHint={props.inheritedHint}
    invalid={props.isInvalid}
    isOverridden={props.isOn}
    label={props.label}
    onToggle={props.onToggle}
  >
    {({ invalid }) => (
      <NumberInput
        invalid={invalid}
        key={String(props.isOn)}
        label={props.label}
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
      inheritedHint={section.inheritedHint}
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
      inheritedHint={section.inheritedHint}
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
      inheritedHint={section.inheritedHint}
      isOverridden={isSubOverridden(definition, sub)}
      label={label}
      onToggle={() => {
        onChange(toggleSubOverride(definition, sub, inherited));
      }}
    >
      {() => (
        <SwitchRow
          isOn={isShown}
          label={t("presets.showField", { field: label })}
          onChange={(isOn) => {
            onChange(setSub(definition, sub, isOn));
          }}
        />
      )}
    </OverrideRow>
  );
};
