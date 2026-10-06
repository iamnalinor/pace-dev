/**
 * The transport every Telegram Bot API call goes through. The Worker passes the
 * platform `fetch`; tests pass a recorder, so no bot test ever touches the network.
 */
export type TelegramTransport = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const telegramFetch: TelegramTransport = async (input, init) => await fetch(input, init);
