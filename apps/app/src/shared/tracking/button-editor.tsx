import { Pressable, ScrollView, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Chip } from "#app/ui/chip.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import {
  type ButtonForm,
  buttonFormOf,
  buttonSaveOf,
  type EditorProps,
  type FormPartProps,
  withCategory,
} from "@pace/client";
import { useDraft } from "@pace/client/react";
import { ACTIVITY_CATEGORIES, CATEGORY_COLORS } from "@pace/core";

export type { EditorTarget } from "@pace/client";

type Draft = ButtonForm;

/** Category, Expect and Limit: what an activity started from the button gets. */
const DefaultsFields = ({ draft, patch }: FormPartProps<Draft>) => {
  const t = useT();
  return (
    <>
      <View className="gap-1.5">
        <Text className="font-sans text-[12px] text-muted">{t("editor.category")}</Text>
        <ScrollView
          accessibilityLabel={t("editor.category")}
          contentContainerClassName="gap-1.5"
          horizontal
        >
          {ACTIVITY_CATEGORIES.map((category) => (
            <Chip
              color={CATEGORY_COLORS[category]}
              key={category}
              onPress={() => {
                patch(withCategory(draft, category));
              }}
              selected={category === draft.category}
            >
              {t(`category.${category}`)}
            </Chip>
          ))}
        </ScrollView>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            hint={t("editor.expectHint")}
            keyboardType="number-pad"
            label={t("editor.expect")}
            onChangeText={(expect) => {
              patch({ expect });
            }}
            value={draft.expect}
          />
        </View>
        <View className="flex-1">
          <TextField
            hint={t("editor.limitHint")}
            keyboardType="number-pad"
            label={t("editor.limit")}
            onChangeText={(limit) => {
              patch({ limit });
            }}
            value={draft.limit}
          />
        </View>
      </View>
    </>
  );
};

/** The sheet behind "press and hold": a button's name, category, Expect and Limit. */
export const ButtonEditor = ({ onClose, target }: EditorProps) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => buttonFormOf(target));
  const save = async (): Promise<void> => {
    const { buttonId, draft: button } = buttonSaveOf(target, draft);
    if (await run(actions.saveButton(buttonId, button))) {
      onClose();
    }
  };
  return (
    <Sheet
      closeLabel={t("common.close")}
      onClose={onClose}
      subtitle={t("time.buttonHint")}
      title={t(target.kind === "edit" ? "editor.title" : "editor.newTitle")}
      visible
    >
      <TextField
        label={t("editor.label")}
        maxLength={80}
        onChangeText={(label) => {
          patch({ label });
        }}
        value={draft.label}
      />
      <DefaultsFields draft={draft} patch={patch} />
      <SheetActions
        cancelLabel={t("common.cancel")}
        onCancel={onClose}
        onPrimary={() => {
          void save();
        }}
        primaryLabel={t("common.save")}
      />
      {target.kind === "edit" ? (
        <Pressable
          accessibilityRole="button"
          className="h-11 items-center justify-center"
          onPress={() => {
            void (async () => {
              if (await run(actions.removeButton(target.button.id))) {
                onClose();
              }
            })();
          }}
        >
          <Text className="font-sans text-[13px] text-muted">{t("editor.remove")}</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
};
