import { useT } from "#app/app-state.tsx";
import { useKeysShown } from "#app/ui/button.tsx";
import { formatHotkey, HOTKEYS } from "#app/ui/hotkeys.ts";
import { ListRow } from "#app/ui/list-row.tsx";

/**
The shortcuts, written the way this computer names its keys; nothing where there is no keyboard,
and nothing at a phone's width, where no button shows a key hint either (`KeyHint`): a list of
Alt+N keys on a phone's Settings described a keyboard the layout does not offer (QA PR55-1-17).
*/
export const KeyboardRow = () => {
  const t = useT();
  const os = useKeysShown();
  if (os === null) {
    return null;
  }
  const line = [
    [HOTKEYS.newTask, t("settings.keyboard.newTask")],
    [HOTKEYS.focus, t("settings.keyboard.focus")],
    // The task's Done and a form's Save or Create (QA round 27 R27-08).
    [HOTKEYS.primary, t("settings.keyboard.primary")],
  ] as const;
  return (
    <ListRow
      subtitle={line.map(([hotkey, name]) => `${formatHotkey(hotkey, os)} — ${name}`).join(", ")}
      title={t("settings.keyboard")}
    />
  );
};
