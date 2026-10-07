import { useId, useState } from "react";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

const DEFAULT_TELEGRAM_ID = "1919230638";

/** Local and e2e only: name a whitelisted Telegram id instead of running the widget. */
export const DevIdentity = ({
  onIdentify,
}: {
  readonly onIdentify: (telegramId: string) => void;
}) => {
  const t = useT();
  const inputId = useId();
  const [telegramId, setTelegramId] = useState(DEFAULT_TELEGRAM_ID);
  const trimmed = telegramId.trim();
  return (
    <div className="grid gap-2 rounded-lg border border-dashed border-line p-3">
      <p className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        {t("login.dev")}
      </p>
      <div className="flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-sm text-fg2" htmlFor={inputId}>
          {t("login.devId")}
          <input
            className="h-11 rounded-md border border-line bg-bg px-3 font-mono text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
            id={inputId}
            inputMode="numeric"
            onChange={(event) => {
              setTelegramId(event.target.value);
            }}
            value={telegramId}
          />
        </label>
        <Button
          disabled={trimmed === ""}
          onClick={() => {
            onIdentify(trimmed);
          }}
          variant="secondary"
        >
          {t("oauth.devUse")}
        </Button>
      </div>
    </div>
  );
};
