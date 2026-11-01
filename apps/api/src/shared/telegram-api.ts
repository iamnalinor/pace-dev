/**
The transport every Telegram Bot API call goes through. The Worker passes the
platform `fetch`; tests pass a recorder, so no bot test ever touches the network.
*/
export type TelegramTransport = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const telegramFetch: TelegramTransport = async (input, init) => await fetch(input, init);

/** A button that answers the bot (`data`) or opens a page (`url`). */
export type InlineButton =
  | { readonly label: string; readonly data: string }
  | { readonly label: string; readonly url: string };

/** A button as the Bot API takes it. */
export const inlineKeyboardButton = (
  button: InlineButton,
):
  | { readonly text: string; readonly callback_data: string }
  | { readonly text: string; readonly url: string } =>
  "url" in button
    ? { text: button.label, url: button.url }
    : { callback_data: button.data, text: button.label };

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

/** One Bot API call; the parsed answer, or `null` when it failed (network or Telegram). */
const callTelegram = async (
  target: TelegramTarget,
  method: string,
  body: Record<string, unknown>,
): Promise<null | { readonly result?: unknown }> => {
  try {
    const response = await target.fetch(`${target.apiRoot}/bot${target.token}/${method}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return response.ok ? await response.json<{ readonly result?: unknown }>() : null;
  } catch {
    return null;
  }
};

/**
A message's text and keyboard as the Bot API takes them. No `parse_mode`: the text goes as plain
text, so a name a client chose (a phone's name on a deep-link login) can never turn into markup
or a link.
*/
const messageBody = (message: OutgoingMessage): Record<string, unknown> => ({
  text: message.text,
  ...(message.buttons.length > 0 && {
    reply_markup: {
      inline_keyboard: message.buttons.map((row) =>
        row.map((button) => inlineKeyboardButton(button)),
      ),
    },
  }),
});

/**
Sends `message` to `chatId`; resolves to the id Telegram gave it, or `null` when it was not
accepted. A network failure counts as "not accepted" rather than an error: one undelivered
message must not stop the rest.
*/
export const sendTelegramMessage = async (
  target: TelegramTarget,
  chatId: string,
  message: OutgoingMessage,
): Promise<null | number> => {
  const answer = await callTelegram(target, "sendMessage", {
    chat_id: chatId,
    ...messageBody(message),
  });
  if (answer === null) {
    return null;
  }
  const result = answer.result as undefined | { readonly message_id?: unknown };
  return typeof result?.message_id === "number" ? result.message_id : 0;
};

/** Sends `message`; whether Telegram accepted it. */
export const wasTelegramMessageSent = async (
  target: TelegramTarget,
  chatId: string,
  message: OutgoingMessage,
): Promise<boolean> => (await sendTelegramMessage(target, chatId, message)) !== null;

/**
Replaces a message sent earlier with `message` (its buttons too: none given removes them): the
bot's reply to a deep-link login that becomes its sign-in notice. Whether Telegram accepted it.
*/
export const wasTelegramMessageEdited = async (
  target: TelegramTarget,
  message: {
    readonly chatId: string;
    readonly messageId: number;
    readonly text: string;
    readonly buttons?: OutgoingMessage["buttons"];
  },
): Promise<boolean> => {
  const answer = await callTelegram(target, "editMessageText", {
    chat_id: message.chatId,
    message_id: message.messageId,
    ...messageBody({ buttons: message.buttons ?? [], text: message.text }),
  });
  return answer !== null;
};

/** Replaces an older confirmation prompt after a newer request superseded it. */
export const editTelegramMessage = async (
  target: TelegramTarget,
  message: { readonly chatId: string; readonly messageId: number; readonly text: string },
): Promise<void> => {
  await wasTelegramMessageEdited(target, message);
};

/** A 4xx refusal except rate limiting cannot be fixed by retrying this deletion. */
export const deleteTelegramMessage = async (
  target: TelegramTarget,
  chatId: string,
  messageId: number,
): Promise<"deleted" | "retry" | "terminal"> => {
  try {
    const response = await target.fetch(`${target.apiRoot}/bot${target.token}/deleteMessage`, {
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (response.ok) {
      return "deleted";
    }
    return response.status >= 400 && response.status < 500 && response.status !== 429
      ? "terminal"
      : "retry";
  } catch {
    return "retry";
  }
};
