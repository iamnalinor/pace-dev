import { X } from "lucide-react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

/** The daily digest times (`HH:MM` on the account's zone); every change is saved at once. */
export const DigestWindowsControl = () => {
  const t = useT();
  const { actions, hooks } = useServices();
  const { digestWindows } = hooks.useSettings();
  const save = (next: readonly string[]): void => {
    void actions.setDigestWindows(next);
  };
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">{t("settings.digestWindows.hint")}</p>
      <ul className="grid gap-2">
        {digestWindows.map((time, index) => (
          // The row is its position: keyed by value, editing a time would remount the input.
          // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
          <li className="flex items-center gap-2" key={index}>
            <input
              aria-label={t("settings.digestWindows.time", { index: index + 1 })}
              className="h-11 flex-1 rounded-md border border-line bg-bg px-3 font-mono text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
              onChange={(event) => {
                const next = event.target.value;
                if (next !== "") {
                  save(digestWindows.with(index, next));
                }
              }}
              type="time"
              value={time}
            />
            <Button
              aria-label={t("settings.digestWindows.remove", { time })}
              onClick={() => {
                save(digestWindows.filter((_, position) => position !== index));
              }}
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        onClick={() => {
          save([...digestWindows, "12:00"]);
        }}
        variant="outline"
      >
        {t("settings.digestWindows.add")}
      </Button>
    </div>
  );
};
