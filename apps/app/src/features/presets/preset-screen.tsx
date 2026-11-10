import { View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { PresetForm } from "#app/features/presets/preset-form.tsx";
import { PresetPreview } from "#app/features/presets/preset-preview.tsx";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { useLeave } from "#app/shared/use-back.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Text } from "#app/ui/text.tsx";
import { editorDraft, newDraft, type PresetDraft } from "@pace/client";
import { presetById, presetLabel } from "@pace/core";

/**
A deleted preset reads as deleted (QA round 25 R25-02): nothing to edit or save, only Restore,
which revokes the archive; restored, the screen shows the ordinary form. What would come back is
shown read-only (R26-07): the sample task drawn with its colour, importance, deadline and progress,
and the preset it is based on, if any.
*/
const DeletedPreset = ({ draft }: { readonly draft: PresetDraft }) => {
  const t = useT();
  const language = useLanguage();
  const { actions } = usePace();
  const presets = useAppState((state) => state.presets);
  const run = useRunAction();
  const parent = draft.extends === null ? undefined : presetById(presets, draft.extends);
  return (
    <View className="pb-6">
      <View className="mx-gutter mt-4 items-start gap-4 px-row-x">
        <Text role="headline">{t("presets.archivedBadge")}</Text>
        <Text role="body" tone="secondary">
          {t("presets.archivedNote")}
        </Text>
        <Button onPress={() => void run(actions.restorePreset(draft.id))} variant="secondary">
          {t("presets.restore")}
        </Button>
      </View>
      <PresetPreview draft={draft} />
      {draft.extends === null ? null : (
        <Text className="mx-gutter mt-3 px-row-x" role="footnote" tone="secondary">
          {t("presets.inherited", {
            from: parent === undefined ? draft.extends : presetLabel(parent, language),
          })}
        </Text>
      )}
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
  const presets = useAppState((state) => state.presets);
  // Save, Delete and Back go to the list it was opened from, a pasted link too (R25-12).
  const done = useLeave("/presets");
  if (id === "new") {
    const parent = from === undefined ? undefined : presetById(presets, from);
    return (
      <PushedScreen parent="/presets" title={t("presets.new")}>
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
      <PushedScreen parent="/presets" title={t("presets.title")}>
        <EmptyState title={t("presets.notFound")} />
      </PushedScreen>
    );
  }
  if (preset.archived) {
    return (
      <PushedScreen parent="/presets" title={presetLabel(preset, language)}>
        <DeletedPreset draft={editorDraft(preset, language)} />
      </PushedScreen>
    );
  }
  return (
    <PushedScreen parent="/presets" title={presetLabel(preset, language)}>
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
