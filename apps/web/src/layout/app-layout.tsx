import { Outlet } from "react-router";

import { TabBar } from "#web/shared/ui/tab-bar.tsx";

/** The phone frame: 430px max, centered on desktop with hairline gutters, tab bar at the bottom. */
export const AppLayout = () => (
  <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg sm:border-x sm:border-line">
    <div className="flex flex-1 flex-col">
      <Outlet />
    </div>
    <TabBar />
  </div>
);
