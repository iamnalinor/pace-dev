import type { Language } from "@pace/core";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { SegmentedControl } from "#web/shared/ui/segmented-control.tsx";

export const LanguageControl = () => {
  const t = useT();
  const language = useLanguage();
  const { state } = useServices();
  const options: readonly { readonly value: Language; readonly label: string }[] = [
    { label: t("settings.language.en"), value: "en" },
    { label: t("settings.language.ru"), value: "ru" },
  ];
  return (
    <SegmentedControl
      label={t("settings.language")}
      onChange={(next) => {
        void state.dispatch({
          occurredAt: new Date().toISOString(),
          payload: { language: next },
          type: "settings.updated",
        });
      }}
      options={options}
      value={language}
    />
  );
};
