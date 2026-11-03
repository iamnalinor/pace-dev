/**
The app's own sign-in (with its bot fallback for a network that blocks the widget), coming back
to the page that sent the person there with its query intact: the login screen follows a
same-origin `next` once signed in (owner bug 2026-11-03, the consent page).
*/
export const signInPathFor = (location: Pick<Location, "pathname" | "search">): string =>
  `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
