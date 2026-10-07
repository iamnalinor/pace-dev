import { useT } from "#web/i18n.tsx";
import { useZones } from "#web/shared/time/use-zones.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

/**
The account zone with the device zone beside it. Another name for the same offset is not
worth a warning, but the device zone stays one tap away whenever the names differ.
*/
export const TimezoneControl = () => {
  const t = useT();
  const zones = useZones();
  const { device, now } = zones;
  // Until the first sync assigns one, the account runs on the device zone (queries do too).
  const account = zones.account ?? device;
  const isOffsetDifferent = zonesDiffer({ at: now, tz: account }, { at: now, tz: device });
  return (
    <div className="grid gap-3 text-sm">
      <p className="font-mono text-fg">{t("settings.timezone.account", { tz: account })}</p>
      {account !== device && (
        <p className="text-muted">{t("settings.timezone.device", { tz: device })}</p>
      )}
      {isOffsetDifferent && <p className="text-warn">{t("settings.timezone.differs")}</p>}
      {account !== device && (
        <Button
          onClick={() => {
            void zones.switchToDevice();
          }}
          variant="outline"
        >
          {t("settings.timezone.use", { tz: device })}
        </Button>
      )}
    </div>
  );
};
