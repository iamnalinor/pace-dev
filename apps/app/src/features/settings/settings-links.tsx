import { useT } from "#app/app-state.tsx";
import { ListRow } from "#app/ui/list-row.tsx";

/**
The settings that live on their own pages: presets. History is a row of More on a phone and of
the sidebar beside it; the decisions to sort are on the Inbox; the assistant's log is on the
notifications page.
*/
export const SettingsLinks = () => {
  const t = useT();
  return (
    <ListRow href="/presets" subtitle={t("settings.presets.hint")} title={t("settings.presets")} />
  );
};
