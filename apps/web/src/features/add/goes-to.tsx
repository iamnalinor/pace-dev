import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { isBuiltInPreset } from "@pace/core";

import type { InstanceChoice } from "./instances.ts";

import { Field } from "./field.tsx";
import { INPUT_CLASS } from "./input-class.ts";

type Props = {
  readonly presetId: string;
  readonly instanceId: null | string;
  readonly instances: readonly InstanceChoice[];
  readonly onPreset: (presetId: string) => void;
  readonly onInstance: (instanceId: null | string) => void;
};

const radioClass = (isChecked: boolean): string =>
  cn(
    "flex min-h-11 items-center rounded-md px-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
    isChecked ? "bg-inverse text-inverseFg" : "bg-raised text-fg2",
  );

/** "Goes to": the preset, and for a recurring one the open instance the problems join. */
export const GoesTo = ({ instanceId, instances, onInstance, onPreset, presetId }: Props) => {
  const t = useT();
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const choices = Object.values(presets.byId).filter(
    (preset) => !preset.archived && preset.id !== "inbox",
  );
  const options = [
    ...instances.map((instance) => ({
      label:
        instance.week === "other"
          ? instance.title
          : `${instance.title} · ${t(`add.week.${instance.week}`)}`,
      value: instance.id,
    })),
    { label: t("add.newTask"), value: null },
  ];
  return (
    <>
      <Field label={t("add.goesTo")}>
        {(id) => (
          <select
            className={cn(INPUT_CLASS, "h-11")}
            id={id}
            onChange={(event) => {
              onPreset(event.target.value);
            }}
            value={presetId}
          >
            {choices.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {isBuiltInPreset(preset.id) ? t(`preset.base.${preset.id}`) : preset.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {instances.length > 0 && (
        <div aria-label={t("add.instance")} className="grid gap-1.5 pb-2.5" role="radiogroup">
          {options.map((option) => (
            <button
              aria-checked={option.value === instanceId}
              className={radioClass(option.value === instanceId)}
              key={option.value ?? "new"}
              onClick={() => {
                onInstance(option.value);
              }}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};
