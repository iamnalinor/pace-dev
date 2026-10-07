import { useT } from "#web/i18n.tsx";
import { type ThemePreference, useThemePreference } from "#web/platform/theme.ts";
import { SegmentedControl } from "#web/shared/ui/segmented-control.tsx";

export const ThemeControl = () => {
  const t = useT();
  const [preference, setPreference] = useThemePreference();
  const options: readonly { readonly value: ThemePreference; readonly label: string }[] = [
    { label: t("settings.theme.system"), value: "system" },
    { label: t("settings.theme.dark"), value: "dark" },
    { label: t("settings.theme.light"), value: "light" },
  ];
  return (
    <SegmentedControl
      label={t("settings.theme")}
      onChange={setPreference}
      options={options}
      value={preference}
    />
  );
};
