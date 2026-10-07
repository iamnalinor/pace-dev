import { useId } from "react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";

const INPUT_CLASS =
  "h-11 w-full rounded-md border border-line bg-bg px-3 font-mono text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40";

/** The nightly window without notifications; each edge is saved as soon as it is a time. */
export const QuietHoursControl = () => {
  const t = useT();
  const id = useId();
  const { actions, hooks } = useServices();
  const { quietHours } = hooks.useSettings();
  const save = (edge: "from" | "to", value: string): void => {
    if (value !== "") {
      void actions.setQuietHours({ ...quietHours, [edge]: value });
    }
  };
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">{t("settings.quietHours.hint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm text-fg2" htmlFor={`${id}-from`}>
          {t("settings.quietHours.from")}
          <input
            className={INPUT_CLASS}
            id={`${id}-from`}
            onChange={(event) => {
              save("from", event.target.value);
            }}
            type="time"
            value={quietHours.from}
          />
        </label>
        <label className="grid gap-1 text-sm text-fg2" htmlFor={`${id}-to`}>
          {t("settings.quietHours.to")}
          <input
            className={INPUT_CLASS}
            id={`${id}-to`}
            onChange={(event) => {
              save("to", event.target.value);
            }}
            type="time"
            value={quietHours.to}
          />
        </label>
      </div>
    </div>
  );
};
