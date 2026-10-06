import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { router } from "./router.tsx";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("#root element is missing in index.html");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
