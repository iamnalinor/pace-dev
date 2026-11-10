import { Tabs, useIsFocused } from "expo-router";

import { useT } from "#app/app-state.tsx";
import { TAB_BACK_BEHAVIOR } from "#app/platform/push-entry.ts";
import { sceneLayout } from "#app/ui/screen-scene.tsx";
import { TabBar } from "#app/ui/tab-bar.tsx";
import { tabHistoryRouter } from "#app/ui/tab-history.ts";
import { useBreakpoint } from "#app/ui/use-breakpoint.ts";

/**
The signed-in shell. The root layout's route gate has already sent a person without a session to
the login screen, and a phone that has not seen the permissions walk-through to it.
*/
export default function TabsLayout() {
  const t = useT();
  const isCompact = useBreakpoint() === "compact";
  // A screen pushed over the tabs (a task) leaves the bar mounted under it, out of sight.
  const isFront = useIsFocused();
  return (
    <Tabs
      // On the web Back and forward follow every screen shown, a change inside one included
      // (feedback 5 item 6, QA round 24 R24-02); a phone keeps the default.
      backBehavior={TAB_BACK_BEHAVIOR}
      screenLayout={sceneLayout}
      screenOptions={{ headerShown: false, tabBarPosition: isCompact ? "bottom" : "left" }}
      tabBar={(props) => <TabBar {...props} isFront={isFront} />}
      UNSTABLE_router={(original) => tabHistoryRouter(original)}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.now") }} />
      <Tabs.Screen name="day" options={{ title: t("nav.day") }} />
      <Tabs.Screen name="inbox" options={{ title: t("nav.inbox") }} />
      {/* More's list and the destinations it opens, in one stack: the bar stays under them. */}
      <Tabs.Screen name="(more)" options={{ title: t("nav.more") }} />
      {/* New task and the share target: Now with the cursor in the composer, not a tab. */}
      <Tabs.Screen name="add" options={{ href: null, title: t("nav.add") }} />
    </Tabs>
  );
}
