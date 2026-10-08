import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

import {
  parseTelegramLogin,
  safeReturnPath,
  savePendingTelegramLogin,
} from "../auth/telegram-return.ts";

/** Telegram's redirect target: keeps the signed login for the widget page and goes back to it. */
export const TelegramReturnScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  useEffect(() => {
    const search = new URLSearchParams(globalThis.location.search);
    const login = parseTelegramLogin(search);
    if (login !== null) {
      savePendingTelegramLogin(login);
    }
    router.replace(safeReturnPath(search.get("return")));
  }, [params, router]);
  return null;
};
