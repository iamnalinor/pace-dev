import type { InboxCard } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { presetById, presetLabel, projectById } from "@pace/core";

/** What the assistant's rules guess for a capture, as label/value pairs and as one line. */
export type Guess = {
  readonly rows: readonly { readonly label: string; readonly value: string }[];
  /** «Homework · Algebra · 4 Nov 18:00», the importance only when it is not Normal. */
  readonly line: string;
};

export const useGuess = (card: InboxCard): Guess => {
  const t = useT();
  const viewer = useViewer();
  const { hooks } = usePace();
  const presets = hooks.useAppState((state) => state.presets);
  const projects = hooks.useAppState((state) => state.projects);
  const { suggestion } = card;
  const preset = presetById(presets, suggestion.presetId);
  const project =
    suggestion.projectId === null ? undefined : projectById(projects, suggestion.projectId);
  const category =
    preset === undefined ? suggestion.presetId : presetLabel(preset, viewer.language);
  const projectName = project?.name ?? t("task.noProject");
  const due =
    suggestion.dueAt === null || suggestion.dueTz === null
      ? t("inbox.noDeadline")
      : zonedText({ at: suggestion.dueAt, mode: "due", tz: suggestion.dueTz }, viewer);
  const importance = t(`importance.${suggestion.importance}`);
  return {
    line: [
      category,
      projectName,
      due,
      ...(suggestion.importance === "normal" ? [] : [importance]),
    ].join(" · "),
    rows: [
      { label: t("composer.category"), value: category },
      { label: t("composer.project"), value: projectName },
      { label: t("composer.due"), value: due },
      { label: t("edit.importance"), value: importance },
    ],
  };
};
