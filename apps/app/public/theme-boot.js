/*
The page takes the app's theme before the bundle loads (F-WEB-02). index.html loads this file
blocking, in <head>: the CSP allows no inline script, and the bundle is deferred, so a person
who chose the dark theme on a light phone would otherwise see the OS's colours until React
mounted. It reads the preference the app writes (`pace.theme`: "system", "light" or "dark",
src/platform/theme.ts) and resolves it as `resolveScheme` does (system: light only when the OS
says light), then sets `data-theme` on <html> (the page ground and `color-scheme` follow it
through the stylesheet in index.html) and both `theme-color` metas.

The ground colours come from the design tokens: `bun design:generate` rewrites the block below
(never edit it). While the app runs, `DocumentTheme` (src/platform/document-theme.web.tsx) takes
over `data-theme` and the metas.
*/
{
  // <generated:grounds>
  const GROUNDS = {
    dark: "#0d0f15",
    light: "#f4f5f9",
  };
  // </generated:grounds>
  const root = document.documentElement;
  let preference = "system";
  try {
    preference = localStorage.getItem("pace.theme") ?? "system";
  } catch {
    // Blocked site data: the OS decides.
  }
  let scheme = preference;
  if (scheme !== "dark" && scheme !== "light") {
    let isLight = false;
    try {
      isLight = matchMedia("(prefers-color-scheme: light)").matches;
    } catch {
      // No media queries: the app's default is dark.
    }
    scheme = isLight ? "light" : "dark";
  }
  root.dataset.theme = scheme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", GROUNDS[scheme]);
  }
}
