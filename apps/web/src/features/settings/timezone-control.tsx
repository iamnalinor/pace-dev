import { useAppState, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

const deviceZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Shows the device and account zones; offers the device zone when they differ. */
export const TimezoneControl = () => {
  const t = useT();
  const { state } = useServices();
  const accountZone = useAppState((current) => current.settings.timezone);
  const zone = deviceZone();
  return (
    <div className="grid gap-3 text-sm">
      <p className="font-mono text-fg2">{t("settings.timezone.device", { tz: zone })}</p>
      <p className="text-muted">
        {accountZone === null
          ? t("settings.timezone.unset")
          : t("settings.timezone.account", { tz: accountZone })}
      </p>
      {accountZone !== zone && (
        <Button
          onClick={() => {
            void state.dispatch({
              occurredAt: new Date().toISOString(),
              payload: { timezone: zone },
              type: "settings.updated",
            });
          }}
          variant="outline"
        >
          {t("settings.timezone.use", { tz: zone })}
        </Button>
      )}
    </div>
  );
};
