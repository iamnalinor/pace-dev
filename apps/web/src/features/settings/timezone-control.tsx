import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

/**
The account zone with the device zone beside it. Another name for the same offset is not
worth a warning, but the device zone stays one tap away whenever the names differ.
*/
export const TimezoneControl = () => {
  const t = useT();
  const { actions, clock, hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { now } = hooks.useClock();
  const device = clock.deviceTz;
  const isOffsetDifferent =
    timezone !== null && zonesDiffer({ at: now, tz: timezone }, { at: now, tz: device });
  return (
    <div className="grid gap-3 text-sm">
      <p className="font-mono text-fg2">{t("settings.timezone.device", { tz: device })}</p>
      <p className="text-muted">
        {timezone === null
          ? t("settings.timezone.unset")
          : t("settings.timezone.account", { tz: timezone })}
      </p>
      {isOffsetDifferent && <p className="text-warn">{t("settings.timezone.differs")}</p>}
      {timezone !== device && (
        <Button
          onClick={() => {
            void actions.setTimezone(device);
          }}
          variant="outline"
        >
          {t("settings.timezone.use", { tz: device })}
        </Button>
      )}
    </div>
  );
};
