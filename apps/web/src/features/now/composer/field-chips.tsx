import { CalendarClock, Clock3, Hash, Link2, ListChecks } from "lucide-react";

import type { ComposerModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { formatDayTime, zoneLabel } from "#web/shared/format/time.ts";
import { chipClass } from "#web/shared/ui/chip-group.tsx";
import { ColorTag } from "#web/shared/ui/color-tag.tsx";
import { zonesDiffer } from "@pace/core";

export type ComposerField = "due" | "estimate" | "link" | "project";

type Props = {
  readonly model: ComposerModel;
  readonly open: ComposerField | null;
  readonly onOpen: (field: ComposerField | null) => void;
};

const FieldChip = ({
  children,
  field,
  label,
  onOpen,
  open,
}: Omit<Props, "model"> & {
  readonly field: ComposerField;
  readonly label: string;
  readonly children: React.ReactNode;
}) => (
  <button
    aria-expanded={open === field}
    aria-label={label}
    className={chipClass(open === field)}
    onClick={() => {
      onOpen(open === field ? null : field);
    }}
    type="button"
  >
    {children}
  </button>
);

const useDueText = (due: ComposerModel["due"]): null | string => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz, now } = useServices().hooks.useClock();
  if (due === null) {
    return null;
  }
  const when = formatDayTime(due, { language, now });
  // The zone is named only when it is not the one the person is in.
  return zonesDiffer(due, { at: due.at, tz: deviceTz })
    ? t("composer.dueChip", { when, zone: zoneLabel(due.at, due.tz, language) })
    : when;
};

const ProjectChip = ({ model, ...shared }: Props) => {
  const t = useT();
  const { newProjectName, project } = model;
  const text =
    project?.name ??
    (newProjectName === null
      ? t("composer.noProject")
      : t("composer.newProject", { name: newProjectName }));
  return (
    <FieldChip {...shared} field="project" label={t("composer.project")}>
      {project === null ? (
        <>
          <Hash aria-hidden="true" className="size-3.5" />
          {text}
        </>
      ) : (
        <ColorTag color={project.color}>{text}</ColorTag>
      )}
    </FieldChip>
  );
};

/** What the line was read as, one chip per field; a tap opens that field's choices. */
export const FieldChips = ({ model, onOpen, open }: Props) => {
  const t = useT();
  const language = useLanguage();
  const due = useDueText(model.due);
  const shared = { onOpen, open };
  return (
    <div className="flex flex-wrap gap-1.5">
      <ProjectChip {...shared} model={model} />
      <FieldChip {...shared} field="due" label={t("composer.due")}>
        <CalendarClock aria-hidden="true" className="size-3.5" />
        {due ?? t("composer.noDue")}
      </FieldChip>
      <FieldChip {...shared} field="estimate" label={t("composer.estimate")}>
        <Clock3 aria-hidden="true" className="size-3.5" />
        {model.estimateMinutes === null
          ? t("composer.noEstimate")
          : formatMinutes(model.estimateMinutes, language)}
      </FieldChip>
      <FieldChip {...shared} field="link" label={t("composer.link")}>
        <Link2 aria-hidden="true" className="size-3.5" />
        {model.link?.host ?? t("composer.noLink")}
      </FieldChip>
      {model.subtasks.length > 0 && (
        <span className={chipClass(false)}>
          <ListChecks aria-hidden="true" className="size-3.5" />
          {t("composer.problems", {
            list: model.subtasks.map((subtask) => subtask.label).join(", "),
          })}
        </span>
      )}
    </div>
  );
};
