/**
 * Where to go after signing in. Only same-app paths are allowed: `?next=https://evil.com`
 * or `//evil.com` would otherwise turn the sign-in page into an open redirect.
 */
export const safeRedirectPath = (next: null | string): string =>
  next !== null && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
