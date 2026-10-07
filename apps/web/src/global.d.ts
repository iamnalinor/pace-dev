import type { TelegramLogin } from "@pace/core";

declare global {
  /** Called by the Telegram Login Widget (`data-onauth="onTelegramAuth(user)"`). */

  var onTelegramAuth: ((user: TelegramLogin) => void) | undefined;
}
