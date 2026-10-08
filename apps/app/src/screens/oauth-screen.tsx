import { Redirect } from "expo-router";

/** MCP clients authorize in a browser: the page exists on the web build only (`.web.tsx`). */
export const OAuthScreen = () => <Redirect href="/" />;
