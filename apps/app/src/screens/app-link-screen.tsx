import { Redirect } from "expo-router";

/** On the phone the App Link is handled before routing (`+native-intent.ts`). */
export const AppLinkScreen = () => <Redirect href="/" />;
