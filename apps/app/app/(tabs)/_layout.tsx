import { Redirect, Tabs } from "expo-router";

import { useAuth, useT } from "#app/app-state.tsx";
import { TabBar } from "#app/ui/tab-bar.tsx";

/** The signed-in shell: without a session the whole tab tree is replaced by the login screen. */
export default function TabsLayout() {
  const t = useT();
  const { status } = useAuth();
  if (status === "loading") {
    return null;
  }
  if (status === "signed-out") {
    return <Redirect href="/login" />;
  }
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t("nav.now") }} />
      <Tabs.Screen name="day" options={{ title: t("nav.day") }} />
      <Tabs.Screen name="add" options={{ title: t("nav.add") }} />
      <Tabs.Screen name="projects" options={{ title: t("nav.projects") }} />
      <Tabs.Screen name="insights" options={{ title: t("nav.insights") }} />
    </Tabs>
  );
}
