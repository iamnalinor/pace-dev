import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

import {
  parseTelegramLogin,
  safeReturnPath,
  savePendingTelegramLogin,
} from "#web/shared/auth/telegram-return.ts";

/** Telegram's redirect target: keeps the signed login for the widget page and goes back to it. */
export const TelegramReturnPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const login = parseTelegramLogin(params);
    if (login !== null) {
      savePendingTelegramLogin(login);
    }
    void navigate(safeReturnPath(params.get("return")), { replace: true });
  }, [params, navigate]);
  return null;
};
