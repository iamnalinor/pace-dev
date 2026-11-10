import { useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { exportData } from "#app/features/settings/export-data.web.ts";
import { errorText } from "#app/format/action-error.ts";
import { Button } from "#app/ui/button.tsx";
import { useToast } from "#app/ui/toast.tsx";

/**
"Export data": downloads the whole account as a spreadsheet, built from the local copy of the log,
and says which file it downloaded (a download alone gives no word in the page, QA round 15 L6).
*/
export const ExportRow = () => {
  const t = useT();
  const toast = useToast();
  const runtime = usePace();
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Button
      busy={isBusy}
      onPress={async () => {
        setIsBusy(true);
        try {
          const result = await exportData(runtime);
          if (result.ok) {
            toast.show({ message: t("settings.export.done", { file: result.value }) });
            return;
          }
          toast.show({
            message:
              result.error === "export/unavailable"
                ? t("settings.export.failed")
                : errorText(t, result.error),
          });
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
