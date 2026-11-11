import { usePace, useT } from "#app/app-state.tsx";
import { exportData, type ExportError } from "#app/features/settings/export-data.web.ts";
import { errorText } from "#app/format/action-error.ts";
import { useBusyLatch } from "#app/shared/use-busy-latch.ts";
import { Button } from "#app/ui/button.tsx";
import { useToast } from "#app/ui/toast.tsx";

/** What a refused export says: its own two codes, else the history's. */
const exportErrorText = (t: ReturnType<typeof useT>, error: ExportError): string => {
  if (error === "export/unavailable") {
    return t("settings.export.failed");
  }
  return error === "export/not-synced" ? t("settings.export.notSynced") : errorText(t, error);
};

/**
"Export data": downloads the whole account as a spreadsheet, built from the local copy of the log,
and says which file it downloaded (a download alone gives no word in the page, QA round 15 L6).
*/
export const ExportRow = () => {
  const t = useT();
  const toast = useToast();
  const runtime = usePace();
  // Two presses in one frame both saw it idle and downloaded twice (class 374).
  const latch = useBusyLatch();
  return (
    <Button
      busy={latch.isBusy}
      onPress={async () => {
        await latch.run(async () => {
          const result = await exportData(runtime);
          toast.show({
            message: result.ok
              ? t("settings.export.done", { file: result.value })
              : exportErrorText(t, result.error),
          });
        });
      }}
      variant="secondary"
    >
      {t("settings.export.action")}
    </Button>
  );
};
