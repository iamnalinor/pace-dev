import { useRouter } from "expo-router";
import { View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { PresetForm } from "#app/features/presets/preset-form.tsx";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Text } from "#app/ui/text.tsx";
import { editorDraft, newDraft } from "@pace/client";
import { presetById, presetLabel } from "@pace/core";

/**
A deleted preset reads as deleted (QA round 25 R25-02): nothing to edit or save, only Restore,
which revokes the archive; restored, the screen shows the ordinary form.
*/
const DeletedPreset = ({ id }: { readonly id: string }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <View className="mx-gutter mt-4 items-start gap-4 px-row-x">
      <Text role="headline">{t("presets.archivedBadge")}</Text>
      <Text role="body" tone="secondary">
        {t("presets.archivedNote")}
      </Text>
      <Button onPress={() => void run(actions.restorePreset(id))} variant="secondary">
        {t("presets.restore")}
      </Button>
    </View>
  );
};

/** `/presets/new?from=<parent>` creates a preset; `/presets/<id>` edits one, a default too. */
export const PresetScreen = ({
  from,
  id,
}: {
  readonly id: string;
  readonly from: string | undefined;
}) => {
  const t = useT();
  const language = useLanguage();
  const router = useRouter();
  const presets = useAppState((state) => state.presets);
  const done = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/presets");
    }
  };
  if (id === "new") {
    const parent = from === undefined ? undefined : presetById(presets, from);
    return (
      <PushedScreen title={t("presets.new")}>
        <PresetForm
          canDelete={false}
          initial={newDraft(parent?.id ?? "hw")}
          isNew
          key={`new:${parent?.id ?? "hw"}`}
          onDone={done}
        />
      </PushedScreen>
    );
  }
  const preset = presetById(presets, id);
  if (preset === undefined) {
    return (
      <PushedScreen title={t("presets.title")}>
        <EmptyState title={t("presets.notFound")} />
      </PushedScreen>
    );
  }
  if (preset.archived) {
    return (
      <PushedScreen title={presetLabel(preset, language)}>
        <DeletedPreset id={preset.id} />
      </PushedScreen>
    );
  }
  return (
    <PushedScreen title={presetLabel(preset, language)}>
      <PresetForm
        canDelete={preset.id !== "inbox"}
        initial={editorDraft(preset, language)}
        isNew={false}
        key={preset.id}
        onDone={done}
      />
    </PushedScreen>
  );
};
