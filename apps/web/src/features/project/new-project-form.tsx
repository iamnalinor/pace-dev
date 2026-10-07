import { Plus } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";
import { toast } from "sonner";

import type { MessageKey, ProjectColorName } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

import { ColorRadios } from "./color-radios.tsx";
import { createProject, projectNameProblem } from "./project-events.ts";
import { ProjectNameField } from "./project-name-field.tsx";

/** "+ New project": a name and a color, created on the spot. */
export const NewProjectForm = () => {
  const t = useT();
  const services = useServices();
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColorName>("blue");
  const [problem, setProblem] = useState<MessageKey | null>(null);

  if (!isOpen) {
    return (
      <Button
        className="justify-self-start"
        onClick={() => {
          setIsOpen(true);
        }}
        variant="outline"
      >
        <Plus aria-hidden="true" strokeWidth={1.75} />
        {t("projects.new")}
      </Button>
    );
  }
  const close = (): void => {
    setIsOpen(false);
    setName("");
    setProblem(null);
  };

  const submit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const found = projectNameProblem(services.state.store.getState().projects, name);
    setProblem(found);
    if (found !== null || (await createProject(services, { color, name })) === null) {
      return;
    }

    toast(t("projects.created", { name: name.trim() }));
    close();
  };

  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-surface p-3.5"
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <ProjectNameField id={`${id}-name`} onChange={setName} value={name} />
      <ColorRadios label={t("projects.color")} onChange={setColor} value={color} />
      {problem !== null && (
        <p className="text-sm text-warn" role="alert">
          {t(problem)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={close} variant="ghost">
          {t("common.cancel")}
        </Button>
        <Button type="submit">{t("projects.create")}</Button>
      </div>
    </form>
  );
};
