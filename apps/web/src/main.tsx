import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Toaster } from "sonner";

import { PaceProvider } from "./app-state.tsx";
import { applyTheme } from "./platform/theme.ts";
import { router } from "./router.tsx";
import { createWebServices } from "./services.ts";

// Before the first paint, so a stored theme never flashes the system one.
applyTheme();

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("#root element is missing in index.html");
}

createRoot(root).render(
  <StrictMode>
    <PaceProvider services={createWebServices()}>
      <RouterProvider router={router} />
      {/* Bottom, clear of the phone tab bar, so a toast never covers a page title. */}
      <Toaster
        mobileOffset={{ bottom: 92 }}
        position="bottom-center"
        // Undo is a real target: at least 24px (WCAG 2.2 target size), here 32px.
        toastOptions={{ classNames: { actionButton: "!h-8 !px-3 !text-[13px]" } }}
      />
    </PaceProvider>
  </StrictMode>,
);
