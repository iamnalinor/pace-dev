import { useId, useState } from "react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

const DEFAULT_TELEGRAM_ID = "1919230638";

type Props = { readonly onError: (code: string) => void };

/** Local/e2e only: signs in as a whitelisted Telegram id without Telegram. */
export const DevLogin = ({ onError }: Props) => {
  const t = useT();
  const { auth } = useServices();
  const inputId = useId();
  const [telegramId, setTelegramId] = useState(DEFAULT_TELEGRAM_ID);
  const [isBusy, setIsBusy] = useState(false);

  return (
    <form
      className="grid gap-2 rounded-lg border border-dashed border-line p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsBusy(true);
        const result = await auth.loginWithDev(telegramId.trim());
        setIsBusy(false);
        if (!result.ok) {
          onError(result.error);
        }
      }}
    >
      <p className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        {t("login.dev")}
      </p>
      <label className="grid gap-1 text-sm text-fg2" htmlFor={inputId}>
        {t("login.devId")}
        <input
          className="h-11 rounded-md border border-line bg-bg px-3 font-mono text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
          id={inputId}
          inputMode="numeric"
          name="telegramId"
          onChange={(event) => {
            setTelegramId(event.target.value);
          }}
          value={telegramId}
        />
      </label>
      <Button disabled={isBusy || telegramId.trim() === ""} type="submit" variant="secondary">
        {t("login.devSubmit")}
      </Button>
    </form>
  );
};
