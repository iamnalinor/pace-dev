import { NavRail } from "./nav-rail.tsx";
import { Sidebar } from "./sidebar.tsx";
import { useBreakpoint } from "./use-breakpoint.ts";

/**
The navigation region of the shell (spec §5.0.1): the sidebar on an `expanded` window, the rail on
a `medium` one, nothing on a phone (its tab bar lives in the tabs' own layout).
*/
export const Navigation = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === "expanded") {
    return <Sidebar />;
  }
  return breakpoint === "medium" ? <NavRail /> : null;
};
