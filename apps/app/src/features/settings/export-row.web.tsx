import { useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { downloadXlsx } from "#app/platform/xlsx.web.ts";
import { Button } from "#app/ui/button.tsx";
import { exportSheets } from "@pace/client";

/** "Export data": downloads the whole account as a spreadsheet, built from the local copy of the log. */
export const ExportRow = () => {
  const t = useT();
  const { clock, state } = usePace();
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Button
      busy={isBusy}
      onPress={async () => {
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
      variant="secondary"
    >
      {t("settings.export.action")}
    </Button>
  );
};
