import { useRouter } from "expo-router";

import { useAppState, useLanguage, useT } from "#app/app-state.tsx";
import { PresetForm } from "#app/features/presets/preset-form.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { editorDraft, newDraft } from "@pace/client";
import { presetById, presetLabel } from "@pace/core";

import { PushedScreen } from "./pushed-screen.tsx";

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
        <EmptyState>{t("presets.notFound")}</EmptyState>
      </PushedScreen>
    );
  }
  return (
    <PushedScreen title={presetLabel(preset, language)}>
      <PresetForm
        canDelete={!preset.archived && preset.id !== "inbox"}
        initial={editorDraft(preset)}
        isNew={false}
        key={preset.id}
        onDone={done}
      />
    </PushedScreen>
  );
};
