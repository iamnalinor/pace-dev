import { Redirect } from "expo-router";

import { MoreScreen } from "#app/screens/more-screen.tsx";
import { useIsWide } from "#app/ui/layout.ts";

/** A phone's tab; beside the sidebar there is nothing to show, so a link to it lands on Now. */
export default function MoreRoute() {
  return useIsWide() ? <Redirect href="/" /> : <MoreScreen />;
}
