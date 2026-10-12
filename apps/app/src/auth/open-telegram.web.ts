import { openURL } from "expo-linking";

/** The call this needs; the browser's own by default, a fake in tests. */
type Linker = { readonly openURL: (url: string) => Promise<unknown> };

const BROWSER: Linker = { openURL };

/**
Opens the bot through `t.me` (see `open-telegram.ts` for the phone). A browser cannot tell
whether anything takes `tg://` (expo-linking always says yes) and opens a dead tab when nothing
does; t.me hands on to Telegram Desktop when it is there and offers Telegram Web when not.
*/
export const openTelegram = async (webLink: string, linker: Linker = BROWSER): Promise<void> => {
  await linker.openURL(webLink);
};
