/**
The transport every Telegram Bot API call goes through. The Worker passes the
platform `fetch`; tests pass a recorder, so no bot test ever touches the network.
*/
export type TelegramTransport = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const telegramFetch: TelegramTransport = async (input, init) => await fetch(input, init);

export type InlineButton = { readonly label: string; readonly data: string };

/** A message with its inline keyboard (rows of buttons). */
export type OutgoingMessage = {
  readonly text: string;
  readonly buttons: readonly (readonly InlineButton[])[];
};

export type TelegramTarget = {
  readonly apiRoot: string;
  readonly token: string;
  readonly fetch: TelegramTransport;
};

/**
Sends `message` to `chatId`; resolves to whether Telegram accepted it. A network failure
counts as "not accepted" rather than an error: one undelivered message must not stop the rest.
*/
export const wasTelegramMessageSent = async (
  target: TelegramTarget,
  chatId: string,
  message: OutgoingMessage,
): Promise<boolean> => {
  const body = JSON.stringify({
    chat_id: chatId,
    text: message.text,
    ...(message.buttons.length > 0 && {
      reply_markup: {
        inline_keyboard: message.buttons.map((row) =>
          row.map((button) => ({ callback_data: button.data, text: button.label })),
        ),
      },
    }),
  });
  try {
    const response = await target.fetch(`${target.apiRoot}/bot${target.token}/sendMessage`, {
      body,
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
};
