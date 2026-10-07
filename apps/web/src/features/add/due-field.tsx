import { useId } from "react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

import { INPUT_CLASS } from "./input-class.ts";

type Props = {
  /** `datetime-local` value; empty = no due. */
  readonly value: string;
  /** The zone the value is read in. */
  readonly zone: string;
  readonly onChange: (value: string) => void;
  readonly onZone: (zone: string) => void;
};

const ZoneChoice = ({ onZone, zone }: Pick<Props, "onZone" | "zone">) => {
  const t = useT();
  const { clock, hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { now } = hooks.useClock();
  const device = clock.deviceTz;
  if (timezone === null || !zonesDiffer({ at: now, tz: timezone }, { at: now, tz: device })) {
    return null;
  }
  const options = [
    { label: t("add.zoneAccount", { tz: timezone }), value: timezone },
    { label: t("add.zoneDevice", { tz: device }), value: device },
  ];
  return (
    <div aria-label={t("add.zoneChoice")} className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={option.value === zone}
          className={cn(
            "h-9 rounded-full border border-line px-3 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
            option.value === zone ? "bg-inverse text-inverseFg" : "text-fg2",
          )}
          key={option.value}
          onClick={() => {
            onZone(option.value);
          }}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

/** The due on a wall clock, always with the zone it is read in; a mismatch offers the other zone. */
export const DueField = ({ onChange, onZone, value, zone }: Props) => {
  const t = useT();
  const id = useId();
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <input
          className={cn(INPUT_CLASS, "h-11 flex-1 font-mono text-[13px]")}
          id={id}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          type="datetime-local"
          value={value}
        />
        {value !== "" && (
          <Button
            onClick={() => {
              onChange("");
            }}
            size="sm"
            variant="ghost"
          >
            {t("add.noDue")}
          </Button>
        )}
      </div>
      <label className="sr-only" htmlFor={id}>
        {t("add.due")}
      </label>
      <p className="font-mono text-xs text-muted">{t("add.dueZone", { tz: zone })}</p>
      <ZoneChoice onZone={onZone} zone={zone} />
    </div>
  );
};
