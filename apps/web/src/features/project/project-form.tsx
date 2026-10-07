import { type SyntheticEvent, useId, useState } from "react";

import type { MessageKey } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";

import { ColorRadios } from "./color-radios.tsx";
import { FIELD_CLASS } from "./field-class.ts";
import { didUpdateProject, type ProjectDraft, projectNameProblem } from "./project-events.ts";

type Props = {
  readonly projectId: string;
  readonly initial: ProjectDraft;
  readonly archived: boolean;
  readonly onDone: () => void;
};

const FormButtons = ({
  archived,
  onArchive,
  onCancel,
}: {
  readonly archived: boolean;
  readonly onArchive: () => Promise<void>;
  readonly onCancel: () => void;
}) => {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        className="mr-auto"
        onClick={() => {
          void onArchive();
        }}
        variant="ghost"
      >
        {t(archived ? "project.restore" : "project.archive")}
      </Button>
      <Button onClick={onCancel} variant="ghost">
        {t("common.cancel")}
      </Button>
      <Button type="submit">{t("common.save")}</Button>
    </div>
  );
};

/** Name, color and description of a project, plus archive / restore. */
export const ProjectForm = ({ archived, initial, onDone, projectId }: Props) => {
  const t = useT();
  const services = useServices();
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<MessageKey | null>(null);

  const save = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const found = projectNameProblem(
      services.state.store.getState().projects,
      draft.name,
      projectId,
    );
    setProblem(found);
    if (found === null && (await didUpdateProject(services, projectId, draft))) {
      onDone();
    }
  };

  const toggleArchive = async (): Promise<void> => {
    await didUpdateProject(services, projectId, { archived: !archived });
    onDone();
  };

  return (
    <form
      className="mx-4 mt-3 grid gap-3 rounded-xl border border-line bg-surface p-3.5"
      noValidate
      onSubmit={(event) => {
        void save(event);
      }}
    >
      <label className="grid gap-1 text-sm text-fg2" htmlFor={`${id}-name`}>
        {t("projects.name")}
        <input
          className={cn(FIELD_CLASS, "h-11")}
          id={`${id}-name`}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
          value={draft.name}
        />
      </label>
      <ColorRadios
        label={t("projects.color")}
        onChange={(color) => {
          setDraft({ ...draft, color });
        }}
        value={draft.color}
      />
      <label className="grid gap-1 text-sm text-fg2" htmlFor={`${id}-description`}>
        {t("project.description")}
        <textarea
          className={cn(FIELD_CLASS, "min-h-20 py-2")}
          id={`${id}-description`}
          onChange={(event) => {
            setDraft({ ...draft, description: event.target.value });
          }}
          value={draft.description}
        />
      </label>
      {problem !== null && (
        <p className="text-sm text-warn" role="alert">
          {t(problem)}
        </p>
      )}
      <FormButtons archived={archived} onArchive={toggleArchive} onCancel={onDone} />
    </form>
  );
};
