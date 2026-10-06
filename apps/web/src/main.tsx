import "./styles.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { createQueryClient } from "#web/shared/api/query-client.ts";
import { Toaster } from "#web/shared/ui/sonner.tsx";

import { router } from "./router.tsx";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("#root element is missing in index.html");
}

// A full navigation also drops every cached response of the expired session.
const queryClient = createQueryClient(() => {
  globalThis.location.assign("/sign-in");
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
