import { type RefObject, useRef, useState } from "react";
import { Text, type TextInput, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { errorText } from "#app/format/action-error.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { toastQuote, useToast } from "#app/ui/toast.tsx";
import { useDiscardDraft } from "#app/ui/use-draft.ts";
import { IS_TOUCH_BROWSER } from "#app/ui/use-hotkey.tsx";
import { definitionIssues, inheritedOf, newPresetId, type PresetDraft } from "@pace/client";
import { byPresetOrder, newId, presetById, presetLabel, resolvePreset } from "@pace/core";

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
  nameDraftKey,
  nameError,
  nameRef,
  onDraft,
}: {
  readonly draft: PresetDraft;
  readonly isNew: boolean;
  /** Why the name is refused, shown on the field itself; it goes once the name changes. */
  readonly nameError: null | string;
  readonly nameRef: RefObject<null | TextInput>;
  readonly onDraft: (draft: PresetDraft) => void;
  readonly nameDraftKey: string;
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
        draftKey={nameDraftKey}
        error={nameError}
        isSubmitted
        label={t("presets.name")}
        onChangeText={(name) => {
          onDraft({ ...draft, name });
        }}
        ref={nameRef}
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
Delete asks once more: the preset leaves the pickers (the toast's Undo, or Restore on the deleted
preset, brings it back). Focus goes to Cancel and back (bug class 5).
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
        variant="plain"
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

/** Saving and deleting a draft: what each refuses and says (the name's refusals on the Name field). */
const usePresetWrites = ({
  draft,
  isNew,
  nameError,
  onDone,
}: {
  readonly draft: PresetDraft;
  readonly isNew: boolean;
  readonly nameError: ReturnType<typeof useNameError>;
  readonly onDone: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const presets = useAppState((state) => state.presets);
  const [problem, setProblem] = useState<null | string>(null);
  const [issues, setIssues] = useState(NO_ISSUES);
  const toast = useToast();
  const run = useRunAction();
  const refuseName = (message: string): void => {
    setProblem(null);
    nameError.refuse(message);
  };
  const finish = (result: Awaited<ReturnType<typeof actions.archivePreset>>): void => {
    setProblem(result.ok ? null : errorText(t, result.error));
    if (result.ok) {
      onDone();
    }
  };
  return {
    issues,
    problem,
    remove: async (): Promise<void> => {
      const result = await actions.archivePreset(draft.id);
      finish(result);
      if (!result.ok) {
        return;
      }
      // As the app's other deletes: a toast with Undo, which revokes the archive (R25-02).
      const [archive] = result.value;
      const name = toastQuote(draft.name.trim());
      toast.show({
        message: t("presets.deleted", { name }),
        ...(archive !== undefined && {
          action: { label: t("common.undo"), onPress: () => void run(actions.revoke(archive.id)) },
        }),
      });
    },
    save: async (): Promise<void> => {
      if (draft.name.trim() === "") {
        refuseName(t("presets.nameRequired"));
        return;
      }
      const name = draft.name.trim();
      // A fresh id's end keeps two devices that name a preset alike offline apart (pr48 follow-up).
      const input = { ...draft, id: isNew ? newPresetId(presets, name, newId()) : draft.id, name };
      const result = isNew ? await actions.createPreset(input) : await actions.updatePreset(input);
      setIssues(
        !result.ok && result.error === "preset/invalid-definition"
          ? definitionIssues(draft.definition)
          : NO_ISSUES,
      );
      if (!result.ok && result.error === "preset/name-taken") {
        refuseName(errorText(t, result.error));
        return;
      }
      finish(result);
    },
  };
};

/** Why the name is refused, shown on the Name field, and the cursor sent back to it (R23-05). */
const useNameError = () => {
  const [message, setMessage] = useState<null | string>(null);
  const ref = useRef<TextInput>(null);
  return {
    clear: (): void => {
      setMessage(null);
    },
    message,
    ref,
    refuse: (text: string): void => {
      setMessage(text);
      ref.current?.focus();
    },
  };
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
  const presets = useAppState((state) => state.presets);
  const [draft, setDraft] = useState(initial);
  const nameError = useNameError();
  // The name typed and not saved survives a reload (feedback 5 item 7); saved or deleted, it goes.
  const nameDraftKey = `preset.${isNew ? "new" : initial.id}.name`;
  const discardDraft = useDiscardDraft();
  const { issues, problem, remove, save } = usePresetWrites({
    draft,
    isNew,
    nameError,
    onDone: () => {
      discardDraft(nameDraftKey);
      onDone();
    },
  });
  const parent = draft.extends === null ? undefined : presetById(presets, draft.extends);
  const inheritedHint =
    draft.extends === null
      ? t("presets.inheritedDefault")
      : t("presets.inherited", {
          from: parent === undefined ? draft.extends : presetLabel(parent, language),
        });
  return (
    <View className="pb-6">
      <Identity
        draft={draft}
        isNew={isNew}
        nameDraftKey={nameDraftKey}
        nameError={nameError.message}
        nameRef={nameError.ref}
        onDraft={(next) => {
          // A changed name is a new attempt: the refusal of the old one goes.
          if (next.name !== draft.name) {
            nameError.clear();
          }
          setDraft(next);
        }}
      />
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
