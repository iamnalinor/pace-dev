import { ScrollView, View } from "react-native";

import type { ActivitySheetProps } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Text } from "#app/ui/text.tsx";
import { HotkeyLayer, useHotkey } from "#app/ui/use-hotkey.tsx";

import { ActivityEditorBody, useActivityEditor } from "./activity-editor.tsx";

const PaneBody = (props: ActivitySheetProps) => {
  const t = useT();
  const { onClose, target } = props;
  const editor = useActivityEditor(props);
  const save = (): void => {
    void editor.save();
  };
  useHotkey(HOTKEYS.escape, onClose);
  useHotkey(HOTKEYS.primary, save);
  return (
    <ScrollView
      contentContainerClassName="gap-4 px-6 pb-16 pt-5"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1" level={2} role="title2">
          {t(target.kind === "edit" ? "day.editTitle" : "day.logPast")}
        </Text>
        <Button onPress={save} shortcut={HOTKEYS.primary} shortcutMode="hint">
          {t("common.save")}
        </Button>
        <IconButton icon="x" label={t("common.close")} onPress={onClose} />
      </View>
      <Text role="footnote" tone="secondary">
        {editor.subtitle}
      </Text>
      <ActivityEditorBody {...props} editor={editor} />
    </ScrollView>
  );
};

/**
The activity editor in the shell's inspector on a computer (spec §5.2: editing opens beside the
day, as Now and Week do): the title, Save at the right with its shortcut, a close ✕; Escape closes.
*/
export const ActivityPane = (props: ActivitySheetProps) => (
  <HotkeyLayer>
    <PaneBody {...props} />
  </HotkeyLayer>
);
