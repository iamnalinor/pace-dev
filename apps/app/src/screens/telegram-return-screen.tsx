import { Redirect } from "expo-router";

/** Telegram's login redirect only ever lands on the web build (`.web.tsx`). */
export const TelegramReturnScreen = () => <Redirect href="/login" />;
