import { Redirect } from "expo-router";

/** On the phone the App Link is rewritten to `/login` first (`+native-intent.ts`). */
export const LoginReturnScreen = () => <Redirect href="/login" />;
