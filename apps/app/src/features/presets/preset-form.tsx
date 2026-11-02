import { useState } from "react";
import { Text, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { errorText } from "#app/format/action-error.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { IS_TOUCH_BROWSER } from "#app/ui/use-hotkey.tsx";
import { definitionIssues, freePresetId, inheritedOf, type PresetDraft } from "@pace/client";
import { byPresetOrder, presetById, presetLabel, resolvePreset } from "@pace/core";

import { ChoiceChips } from "./choice-chips.tsx";
import { PresetPreview } from "./preset-preview.tsx";
import { PresetSections } from "./preset-sections.tsx";

const NO_ISSUES: ReadonlySet<string> = new Set();

/**
Name and the parent; a default preset has no parent. The id is never typed: a new preset gets one
from its name when saved (QA round 18 L4), and a new one opens with the cursor in Name where
there is a keyboard to type with (bug class 71).
*/
const Identity = ({
  draft,
  isNew,
  onDraft,
}: {
  readonly draft: PresetDraft;
  readonly isNew: boolean;
  readonly onDraft: (draft: PresetDraft) => void;
}) => {
  const t = useT();
  const language = useLanguage();
  const presets = useAppState((state) => state.presets);
  const parents = Object.values(presets.byId)
    .filter(
      (preset) =>
        preset.id !== draft.id &&
        preset.id !== "inbox" &&
        (!preset.archived || preset.id === draft.extends),
    )
    .toSorted(byPresetOrder);
  const { extends: parent } = draft;
  return (
    <View className="mx-4 gap-3 rounded-xl border border-separator bg-cell p-4">
      <TextField
        autoFocus={isNew && !IS_TOUCH_BROWSER}
        label={t("presets.name")}
        onChangeText={(name) => {
          onDraft({ ...draft, name });
        }}
        value={draft.name}
      />
      {parent === null ? null : (
        <View className="gap-2">
          <Text className="font-sans text-caption font-normal text-label-tertiary">
            {t("presets.extends")}
          </Text>
          <ChoiceChips
            colorOf={(id) => {
              const resolved = resolvePreset(presets, id);
              return resolved.ok ? resolved.value.color : "slate";
            }}
            label={t("presets.extends")}
            labelOf={(id) => {
              const preset = presetById(presets, id);
              return preset === undefined ? id : presetLabel(preset, language);
            }}
            onChange={(next) => {
              onDraft({ ...draft, extends: next });
            }}
            value={parent}
            values={parents.map((preset) => preset.id)}
          />
        </View>
      )}
    </View>
  );
};

/**
Delete asks once more: the preset leaves the pickers (History brings it back). Focus goes to
Cancel and back (bug class 5).
*/
const DeleteButton = ({
  name,
  onDelete,
}: {
  readonly name: string;
  readonly onDelete: () => void;
}) => {
  const t = useT();
  const [isConfirming, setIsConfirming] = useState(false);
  const focus = useConfirmFocus();
  const question = t("presets.deleteConfirm", { name });
  if (!isConfirming) {
    return (
      <Button
        onPress={() => {
          focus.toCancel();
          setIsConfirming(true);
        }}
        ref={focus.openerRef()}
        variant="ghost"
      >
        {t("presets.archive")}
      </Button>
    );
  }
  return (
    <View
      aria-label={question}
      className="mx-4 mt-4 gap-2 rounded-xl border border-separator bg-cell p-4"
      role="group"
    >
      <Text
        accessibilityLiveRegion="polite"
        className="font-sans text-subhead font-normal text-label-primary"
        role="status"
      >
        {question}
      </Text>
      <SheetActions
        cancelLabel={t("common.cancel")}
        cancelRef={focus.cancelRef(question)}
        onCancel={() => {
          focus.toOpener();
          setIsConfirming(false);
        }}
        onPrimary={onDelete}
        primaryLabel={t("common.delete")}
      />
    </View>
  );
};

/** The whole editor for one draft: identity, preview, sections, then Delete and Save. */
export const PresetForm = ({
  canDelete,
  initial,
  isNew,
  onDone,
}: {
  readonly initial: PresetDraft;
  readonly isNew: boolean;
  readonly canDelete: boolean;
  readonly onDone: () => void;
}) => {
  const t = useT();
  const language = useLanguage();
  const { actions } = usePace();
  const presets = useAppState((state) => state.presets);
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<null | string>(null);
  const [issues, setIssues] = useState(NO_ISSUES);
  const parent = draft.extends === null ? undefined : presetById(presets, draft.extends);
  const inheritedHint =
    draft.extends === null
      ? t("presets.inheritedDefault")
      : t("presets.inherited", {
          from: parent === undefined ? draft.extends : presetLabel(parent, language),
        });

  const save = async (): Promise<void> => {
    if (draft.name.trim() === "") {
      setProblem(t("presets.nameRequired"));
      return;
    }
    const name = draft.name.trim();
    const input = { ...draft, id: isNew ? freePresetId(presets, name) : draft.id, name };
    const result = isNew ? await actions.createPreset(input) : await actions.updatePreset(input);
    setIssues(
      !result.ok && result.error === "preset/invalid-definition"
        ? definitionIssues(draft.definition)
        : NO_ISSUES,
    );
    setProblem(result.ok ? null : errorText(t, result.error));
    if (result.ok) {
      onDone();
    }
  };

  const remove = async (): Promise<void> => {
    const result = await actions.archivePreset(draft.id);
    setProblem(result.ok ? null : errorText(t, result.error));
    if (result.ok) {
      onDone();
    }
  };

  return (
    <View className="pb-6">
      <Identity draft={draft} isNew={isNew} onDraft={setDraft} />
      <PresetPreview draft={draft} />
      <PresetSections
        definition={draft.definition}
        inherited={inheritedOf(presets, draft)}
        inheritedHint={inheritedHint}
        issues={issues}
        onChange={(definition) => {
          setDraft({ ...draft, definition });
        }}
      />
      {problem === null ? null : (
        <Text
          accessibilityRole="alert"
          className="mx-5 mt-3 font-sans text-subhead font-normal text-danger"
        >
          {problem}
        </Text>
      )}
      <View className="gap-2 px-4 pt-4">
        <Button onPress={() => void save()}>{t("common.save")}</Button>
        {canDelete ? <DeleteButton name={draft.name} onDelete={() => void remove()} /> : null}
      </View>
    </View>
  );
};
