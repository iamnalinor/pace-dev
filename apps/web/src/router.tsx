import { createBrowserRouter } from "react-router";

import { RequireAuth } from "#web/features/auth/require-auth.tsx";
import { SignInPage } from "#web/features/auth/sign-in-page.tsx";
import { SignUpPage } from "#web/features/auth/sign-up-page.tsx";
import { ExampleFeedPage } from "#web/features/example-posts/example-feed-page.tsx";
import { AppLayout } from "#web/shared/app-layout.tsx";
import { RouteError } from "#web/shared/route-error.tsx";

export const router = createBrowserRouter([
  {
    children: [
      {
        element: (
          <RequireAuth>
            <ExampleFeedPage />
          </RequireAuth>
        ),
        index: true,
      },
      { element: <SignInPage />, path: "sign-in" },
      { element: <SignUpPage />, path: "sign-up" },
      { element: <RouteError />, path: "*" },
    ],
    element: <AppLayout />,
    errorElement: <RouteError />,
    path: "/",
  },
]);
