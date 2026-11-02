import { Text, View } from "react-native";

import type { InboxCard } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { presetById, presetLabel, projectById } from "@pace/core";

/** The guess in words: category · project · due · importance. */
const useGuess = (card: InboxCard): string => {
  const t = useT();
  const viewer = useViewer();
  const { hooks } = usePace();
  const presets = hooks.useAppState((state) => state.presets);
  const projects = hooks.useAppState((state) => state.projects);
  const { suggestion } = card;
  const preset = presetById(presets, suggestion.presetId);
  const project =
    suggestion.projectId === null ? undefined : projectById(projects, suggestion.projectId);
  const presetName =
    preset === undefined ? suggestion.presetId : presetLabel(preset, viewer.language);
  return [
    presetName,
    project?.name ?? t("task.noProject"),
    suggestion.dueAt === null || suggestion.dueTz === null
      ? t("inbox.noDeadline")
      : zonedText({ at: suggestion.dueAt, mode: "due", tz: suggestion.dueTz }, viewer),
    t(`importance.${suggestion.importance}`),
  ].join(" · ");
};

export const CardView = ({ card }: { readonly card: InboxCard }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const guess = useGuess(card);
  return (
    <View className="gap-3 rounded-xl border border-separator bg-cell p-4" role="listitem">
      <Text className="font-sans text-callout text-label-primary">{card.text}</Text>
      <Text className="font-sans text-caption font-normal text-label-tertiary">{guess}</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            onPress={() => {
              void run(actions.acceptSuggestion(card.id, card.suggestion));
            }}
            width="fill"
          >
            {t("common.accept")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() => {
              void run(actions.discardInbox(card.id));
            }}
            variant="secondary"
            width="fill"
          >
            {t("common.delete")}
          </Button>
        </View>
      </View>
    </View>
  );
};
