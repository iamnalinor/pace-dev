import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { zonesDiffer } from "@pace/core";

/** Shown when the device sits in another zone than the account: one tap moves the account. */
export const ZoneBanner = () => {
  const t = useT();
  const { actions, clock, hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { now } = hooks.useClock();
  const device = clock.deviceTz;
  if (timezone === null || !zonesDiffer({ at: now, tz: timezone }, { at: now, tz: device })) {
    return null;
  }
  return (
    <div
      className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-fg2"
      role="status"
    >
      <p className="flex-1">{t("zone.banner", { account: timezone, device })}</p>
      <Button
        onClick={() => {
          void actions.setTimezone(device);
        }}
        size="sm"
        variant="outline"
      >
        {t("zone.use", { device })}
      </Button>
    </div>
  );
};
