/*
Paints the page in the theme chosen in Pace before the app has loaded (QA round 17 L9): the
stored choice (`pace.theme`, kept by the app's web secure store) marks <html>, which the page's
first style reads, and the browser's own colour follows it. A file, not inline: the page's CSP
allows scripts from this origin only. The app keeps both current afterwards (document-head.web.tsx).
*/
(function bootTheme() {
  var COLORS = { dark: "#0b0b0c", light: "#f4f5f7" };
  var choice;
  try {
    choice = globalThis.localStorage.getItem("pace.theme");
  } catch {
    return;
  }
  if (choice !== "dark" && choice !== "light") {
    return;
  }
  document.documentElement.dataset.theme = choice;
  for (var meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.removeAttribute("media");
    meta.setAttribute("content", COLORS[choice]);
  }
})();
