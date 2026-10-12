import { canOpenURL, openURL } from "expo-linking";

/** The two calls this needs; the phone's own by default, a fake in tests. */
export type Linker = {
  readonly canOpenURL: (url: string) => Promise<boolean>;
  readonly openURL: (url: string) => Promise<unknown>;
};

const PHONE: Linker = { canOpenURL, openURL };

/** A URL, or undefined (no URL.canParse: Hermes' URL may lack it). */
const parsed = (text: string): undefined | URL => {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
};

/** `https://t.me/<bot>?start=<payload>` as Telegram's own `tg://resolve` link; else undefined. */
export const telegramAppLink = (webLink: string): string | undefined => {
  const url = parsed(webLink);
  if (url === undefined) {
    return undefined;
  }
  const bot = url.pathname.slice(1);
  const start = url.searchParams.get("start");
  return start === null || bot === "" || url.hostname !== "t.me" || bot.includes("/")
    ? undefined
    : `tg://resolve?domain=${encodeURIComponent(bot)}&start=${encodeURIComponent(start)}`;
};

/**
Opens the bot: straight in the Telegram app when something on the phone takes `tg://`, else
(or when that fails) through `t.me`, which the browser hands on or shows a page for.
*/
export const openTelegram = async (webLink: string, linker: Linker = PHONE): Promise<void> => {
  const appLink = telegramAppLink(webLink);
  if (appLink !== undefined && (await linker.canOpenURL(appLink))) {
    try {
      await linker.openURL(appLink);
      return;
    } catch {
      // Resolved but did not open: the web link below still gets there.
    }
  }
  await linker.openURL(webLink);
};
