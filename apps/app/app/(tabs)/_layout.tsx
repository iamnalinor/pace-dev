import { Tabs } from "expo-router";

import { useT } from "#app/app-state.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenScene } from "#app/ui/screen-scene.tsx";
import { TabBar } from "#app/ui/tab-bar.tsx";

/**
The signed-in shell. The root layout's route gate has already sent a person without a session to
the login screen, and a phone that has not seen the permissions walk-through to it.
*/
export default function TabsLayout() {
  const t = useT();
  const isWide = useIsWide();
  return (
    <Tabs
      screenLayout={({ children }) => <ScreenScene>{children}</ScreenScene>}
      screenOptions={{ headerShown: false, tabBarPosition: isWide ? "left" : "bottom" }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.now") }} />
      <Tabs.Screen name="day" options={{ title: t("nav.day") }} />
      <Tabs.Screen name="inbox" options={{ title: t("nav.inbox") }} />
      <Tabs.Screen name="more" options={{ title: t("nav.more") }} />
      {/* New task and the share target: Now with the cursor in the composer, not a tab. */}
      <Tabs.Screen name="add" options={{ href: null, title: t("nav.add") }} />
    </Tabs>
  );
}
