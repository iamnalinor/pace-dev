import { useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { downloadXlsx } from "#app/platform/xlsx.web.ts";
import { Button } from "#app/ui/button.tsx";
import { useToast } from "#app/ui/toast.tsx";
import { exportSheets } from "@pace/client";

/**
"Export data": downloads the whole account as a spreadsheet, built from the local copy of the log,
and says which file it downloaded (a download alone gives no word in the page, QA round 15 L6).
*/
export const ExportRow = () => {
  const t = useT();
  const toast = useToast();
  const { clock, state } = usePace();
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Button
      busy={isBusy}
      onPress={async () => {
        setIsBusy(true);
        try {
          const now = clock.now();
          const file = `pace-${now.slice(0, 10)}.xlsx`;
          await downloadXlsx(exportSheets(state.store.getState(), now), file);
          toast.show({ message: t("settings.export.done", { file }) });
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
