import { createBrowserRouter } from "react-router";

import { RequireAuth } from "#web/features/auth/require-auth.tsx";
import { AppLayout } from "#web/layout/app-layout.tsx";
import { AddPage } from "#web/pages/add-page.tsx";
import { AppLinkPage } from "#web/pages/app-link-page.tsx";
import { DayPage } from "#web/pages/day-page.tsx";
import { InboxPage } from "#web/pages/inbox-page.tsx";
import { InsightsPage } from "#web/pages/insights-page.tsx";
import { LoginPage } from "#web/pages/login-page.tsx";
import { NowPage } from "#web/pages/now-page.tsx";
import { OAuthAuthorizePage } from "#web/pages/oauth-authorize-page.tsx";
import { ProjectPage } from "#web/pages/project-page.tsx";
import { ProjectsPage } from "#web/pages/projects-page.tsx";
import { ReviewPage } from "#web/pages/review-page.tsx";
import { SettingsPage } from "#web/pages/settings-page.tsx";
import { RouteError } from "#web/shared/route-error.tsx";

export const router = createBrowserRouter([
  { element: <LoginPage />, errorElement: <RouteError />, path: "/login" },
  { element: <AppLinkPage />, errorElement: <RouteError />, path: "/app/auth" },
  { element: <OAuthAuthorizePage />, errorElement: <RouteError />, path: "/oauth/authorize" },
  {
    children: [
      {
        children: [
          { element: <NowPage />, index: true },
          { element: <DayPage />, path: "day" },
          { element: <AddPage />, path: "add" },
          { element: <ProjectsPage />, path: "projects" },
          { element: <ProjectPage />, path: "projects/:id" },
          { element: <InboxPage />, path: "inbox" },
          { element: <ReviewPage />, path: "review" },
          { element: <InsightsPage />, path: "insights" },
          { element: <SettingsPage />, path: "settings" },
        ],
        element: <AppLayout />,
      },
    ],
    element: <RequireAuth />,
    errorElement: <RouteError />,
    path: "/",
  },
  { element: <RouteError />, path: "*" },
]);
