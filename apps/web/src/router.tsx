import { createBrowserRouter } from "react-router";

import { RouteError } from "#web/shared/route-error.tsx";
import { Button } from "#web/shared/ui/button.tsx";

const Home = () => (
  <main className="grid gap-4 p-6">
    <h1 className="text-2xl font-semibold">Pace</h1>
    <Button>Get started</Button>
  </main>
);

export const router = createBrowserRouter([
  {
    children: [
      { element: <Home />, index: true },
      { element: <RouteError />, path: "*" },
    ],
    errorElement: <RouteError />,
    path: "/",
  },
]);
