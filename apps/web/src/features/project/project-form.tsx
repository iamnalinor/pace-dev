import { type FormEvent, useId, useState } from "react";

import type { MessageKey } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";

import { ColorRadios } from "./color-radios.tsx";
import { FIELD_CLASS } from "./field-class.ts";
import { type ProjectDraft, projectNameProblem, updateProject } from "./project-events.ts";

type Props = {
  readonly projectId: string;
  readonly initial: ProjectDraft;
  readonly archived: boolean;
  readonly onDone: () => void;
};

/** Name, color and description of a project, plus archive / restore. */
export const ProjectForm = ({ archived, initial, onDone, projectId }: Props) => {
  const t = useT();
  const services = useServices();
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<MessageKey | null>(null);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const found = projectNameProblem(
      services.state.store.getState().projects,
      draft.name,
      projectId,
    );
    setProblem(found);
    if (found === null && (await updateProject(services, projectId, draft))) {
      onDone();
    }
  };

  const toggleArchive = async (): Promise<void> => {
    await updateProject(services, projectId, { archived: !archived });
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          className="mr-auto"
          onClick={() => {
            void toggleArchive();
          }}
          variant="ghost"
        >
          {t(archived ? "project.restore" : "project.archive")}
        </Button>
        <Button onClick={onDone} variant="ghost">
          {t("common.cancel")}
        </Button>
        <Button type="submit">{t("common.save")}</Button>
      </div>
    </form>
  );
};
