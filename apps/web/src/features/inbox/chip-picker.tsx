import { type ReactNode, useId } from "react";

import type { Suggestion } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { CategoryChips } from "#web/shared/ui/category-chips.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { ImportanceChips } from "#web/shared/ui/importance-chips.tsx";

import type { ChipField, SuggestionEdits } from "./suggestion-chips.ts";

type Props = {
  readonly field: ChipField;
  readonly suggestion: Suggestion;
  readonly onEdit: (edits: SuggestionEdits) => void;
};

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40";

const Labelled = ({
  children,
  label,
}: {
  readonly children: (id: string) => ReactNode;
  readonly label: string;
}) => {
  const id = useId();
  return (
    <div className="grid gap-1 text-xs text-muted">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
};

const NO_PROJECT = "none";

const ProjectPicker = ({ onEdit, suggestion }: Omit<Props, "field">) => {
  const t = useT();
  const projects = useServices().hooks.useAppState((state) => state.projects);
  const active = Object.values(projects.byId)
    .filter((project) => !project.archived)
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return (
    <ChipGroup
      label={t("inbox.project")}
      onChange={(value) => {
        onEdit({ projectId: value === NO_PROJECT ? null : value });
      }}
      options={[
        { label: t("task.noProject"), value: NO_PROJECT },
        ...active.map((project) => ({
          color: project.color,
          label: project.name,
          value: project.id,
        })),
      ]}
      value={suggestion.projectId ?? NO_PROJECT}
    />
  );
};

const PresetPicker = ({ onEdit, suggestion }: Omit<Props, "field">) => (
  <CategoryChips
    onChange={(presetId, importance) => {
      onEdit({ importance, presetId });
    }}
    value={suggestion.presetId}
  />
);

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
  switch (field) {
    case "due": {
      return <DuePicker onEdit={onEdit} suggestion={suggestion} />;
    }
    case "importance": {
      return (
        <ImportanceChips
          onChange={(importance) => {
            onEdit({ importance });
          }}
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
