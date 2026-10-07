import { type ReactNode, useId } from "react";

import type { Importance, Suggestion } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { SegmentedControl } from "#web/shared/ui/segmented-control.tsx";

import type { ChipField, SuggestionEdits } from "./suggestion-chips.ts";

import { useChipText } from "./use-chip-text.ts";

type Props = {
  readonly field: ChipField;
  readonly suggestion: Suggestion;
  readonly onEdit: (edits: SuggestionEdits) => void;
};

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40";

const IMPORTANCES: readonly Importance[] = ["asap", "prioritized", "normal", "nice_to_have"];

const Labelled = ({ children, label }: { readonly children: (id: string) => ReactNode; readonly label: string }) => {
  const id = useId();
  return (
    <div className="grid gap-1 text-xs text-muted">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
};

const ProjectPicker = ({ onEdit, suggestion }: Omit<Props, "field">) => {
  const t = useT();
  const projects = useServices().hooks.useAppState((state) => state.projects);
  const active = Object.values(projects.byId)
    .filter((project) => !project.archived)
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return (
    <Labelled label={t("inbox.project")}>
      {(id) => (
        <select
          className={SELECT_CLASS}
          id={id}
          onChange={(event) => {
            onEdit({ projectId: event.target.value === "" ? null : event.target.value });
          }}
          value={suggestion.projectId ?? ""}
        >
          <option value="">{t("task.noProject")}</option>
          {active.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      )}
    </Labelled>
  );
};

const PresetPicker = ({ onEdit, suggestion }: Omit<Props, "field">) => {
  const t = useT();
  const { presetName } = useChipText();
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const choices = Object.values(presets.byId).filter((preset) => !preset.archived && preset.id !== "inbox");
  return (
    <Labelled label={t("inbox.preset")}>
      {(id) => (
        <select
          className={SELECT_CLASS}
          id={id}
          onChange={(event) => {
            onEdit({ presetId: event.target.value });
          }}
          value={suggestion.presetId}
        >
          {choices.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {presetName(preset)}
            </option>
          ))}
        </select>
      )}
    </Labelled>
  );
};

const DuePicker = ({ onEdit, suggestion }: Omit<Props, "field">) => {
  const t = useT();
  const { hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { deviceTz } = hooks.useClock();
  const zone = suggestion.dueTz ?? timezone ?? deviceTz;
  return (
    <Labelled label={t("inbox.dueLabel")}>
      {(id) => (
        <>
          <div className="flex items-center gap-2">
            <input
              className={SELECT_CLASS}
              id={id}
              onChange={(event) => {
                const dueAt = wallClockToIso(event.target.value, zone);
                if (dueAt !== null) {
                  onEdit({ dueAt, dueTz: zone });
                }
              }}
              type="datetime-local"
              value={suggestion.dueAt === null ? "" : isoToWallClock(suggestion.dueAt, zone)}
            />
            <Button
              onClick={() => {
                onEdit({ dueAt: null, dueTz: null });
              }}
              size="sm"
              variant="ghost"
            >
              {t("inbox.noDeadline")}
            </Button>
          </div>
          <span className="font-mono">{t("add.dueZone", { tz: zone })}</span>
        </>
      )}
    </Labelled>
  );
};

/** The small editor a chip opens: one field of the suggestion, changed in place. */
export const ChipPicker = ({ field, onEdit, suggestion }: Props) => {
  const t = useT();
  switch (field) {
    case "due": {
      return <DuePicker onEdit={onEdit} suggestion={suggestion} />;
    }
    case "importance": {
      return (
        <SegmentedControl
          label={t("inbox.importance")}
          onChange={(importance) => {
            onEdit({ importance });
          }}
          options={IMPORTANCES.map((value) => ({ label: t(`importance.${value}`), value }))}
          value={suggestion.importance}
        />
      );
    }
    case "preset": {
      return <PresetPicker onEdit={onEdit} suggestion={suggestion} />;
    }
    case "project": {
      return <ProjectPicker onEdit={onEdit} suggestion={suggestion} />;
    }
  }
};
