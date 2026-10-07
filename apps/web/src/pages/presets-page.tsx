import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

import { PresetsList } from "#web/features/presets/presets-list.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

export const PresetsPage = () => {
  const t = useT();
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 px-2 pt-3.5 pb-3">
        <Button aria-label={t("common.back")} asChild size="icon" variant="ghost">
          <Link to="/settings">
            <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </Button>
        <h1 className="text-[22px] font-semibold">{t("presets.title")}</h1>
      </header>
      <p className="mx-5 mb-3 text-xs text-muted">{t("settings.presets.hint")}</p>
      <PresetsList />
    </main>
  );
};
