import { Download } from "lucide-react";
import { useState } from "react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { downloadXlsx } from "#web/platform/xlsx.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { exportSheets } from "@pace/client";

/** Downloads the whole account as a spreadsheet, built from the local copy of the log. */
export const ExportControl = () => {
  const t = useT();
  const { clock, state } = useServices();
  const [isBusy, setIsBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted">{t("settings.export.hint")}</p>
      <Button
        disabled={isBusy}
        onClick={async () => {
          setIsBusy(true);
          try {
            const now = clock.now();
            await downloadXlsx(
              exportSheets(state.store.getState(), now),
              `pace-${now.slice(0, 10)}.xlsx`,
            );
          } finally {
            setIsBusy(false);
          }
        }}
        variant="outline"
      >
        <Download aria-hidden="true" strokeWidth={1.75} />
        {t("settings.export.action")}
      </Button>
    </div>
  );
};
