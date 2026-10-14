import { Redirect, Tabs } from "expo-router";

import { useAuth, useT } from "#app/app-state.tsx";
import { useOnboarded } from "#app/features/permissions/use-onboarded.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenScene } from "#app/ui/screen-scene.tsx";
import { TabBar } from "#app/ui/tab-bar.tsx";

/**
The signed-in shell: without a session the whole tab tree is replaced by the login screen,
and a phone that has not seen the permissions walk-through goes there first.
*/
export default function TabsLayout() {
  const t = useT();
  const { status } = useAuth();
  const isOnboarded = useOnboarded();
  const isWide = useIsWide();
  if (status === "loading" || (status === "signed-in" && isOnboarded === null)) {
    return null;
  }
  if (status === "signed-out") {
    return <Redirect href="/login" />;
  }
  if (isOnboarded === false) {
    return <Redirect href="/onboarding" />;
  }
  return (
    <Tabs
      screenLayout={({ children }) => <ScreenScene>{children}</ScreenScene>}
      screenOptions={{ headerShown: false, tabBarPosition: isWide ? "left" : "bottom" }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.now") }} />
      <Tabs.Screen name="day" options={{ title: t("nav.day") }} />
      <Tabs.Screen name="calendar" options={{ title: t("nav.calendar") }} />
      <Tabs.Screen name="inbox" options={{ title: t("nav.inbox") }} />
      <Tabs.Screen name="more" options={{ title: t("nav.more") }} />
      {/* New task and the share target: Now with the cursor in the composer, not a tab. */}
      <Tabs.Screen name="add" options={{ href: null, title: t("nav.add") }} />
    </Tabs>
  );
}
