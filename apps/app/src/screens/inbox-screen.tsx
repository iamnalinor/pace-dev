import { Text, View } from "react-native";

import type { InboxCard } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { isBuiltInPreset, presetById, projectById } from "@pace/core";

import { PushedScreen } from "./pushed-screen.tsx";

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
    preset !== undefined && isBuiltInPreset(preset.id)
      ? t(`preset.base.${preset.id}`)
      : (preset?.name ?? suggestion.presetId);
  return [
    presetName,
    project?.name ?? t("task.noProject"),
    suggestion.dueAt === null || suggestion.dueTz === null
      ? t("inbox.noDeadline")
      : zonedText({ at: suggestion.dueAt, mode: "due", tz: suggestion.dueTz }, viewer),
    t(`importance.${suggestion.importance}`),
  ].join(" · ");
};

const CardView = ({ card }: { readonly card: InboxCard }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const guess = useGuess(card);
  return (
    <View className="gap-2.5 rounded-xl border border-line bg-surface p-3.5">
      <Text className="font-sans text-[15px] text-fg">{card.text}</Text>
      <Text className="font-sans text-[12px] text-muted">{guess}</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            onPress={() => {
              void run(actions.acceptSuggestion(card.id, card.suggestion), {
                success: t("inbox.accepted"),
                undo: true,
              });
            }}
          >
            {t("common.accept")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() => {
              void run(actions.discardInbox(card.id), { success: t("inbox.deleted"), undo: true });
            }}
            variant="secondary"
          >
            {t("common.delete")}
          </Button>
        </View>
      </View>
    </View>
  );
};

/** The inbox: each capture verbatim with its guess, accepted or deleted with one tap. */
export const InboxScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const inbox = hooks.useInbox();
  return (
    <PushedScreen title={t("inbox.title")}>
      <Text className="mx-5 mb-3 font-sans text-[12px] text-muted">{t("inbox.hint")}</Text>
      {inbox.count === 0 ? <EmptyState>{t("inbox.empty")}</EmptyState> : null}
      <View className="gap-2.5 px-4">
        {inbox.cards.map((card) => (
          <CardView card={card} key={card.id} />
        ))}
      </View>
    </PushedScreen>
  );
};
