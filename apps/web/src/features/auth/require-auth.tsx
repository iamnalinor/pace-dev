import type { ReactNode } from "react";

import { Navigate, useLocation, useSearchParams } from "react-router";

import { authClient } from "#web/shared/auth/auth-client.ts";

import { safeRedirectPath } from "./safe-redirect.ts";

const FullPageSpinner = () => (
  <p aria-live="polite" className="p-8 text-center text-muted-foreground">
    Loading…
  </p>
);

/** Renders children only for signed-in users; others go to sign-in and come back after. */
export const RequireAuth = ({ children }: { readonly children: ReactNode }) => {
  const session = authClient.useSession();
  const location = useLocation();
  if (session.isPending) {
    return <FullPageSpinner />;
  }
  if (session.data === null) {
    const next = `${location.pathname}${location.search}`;
    const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
    return <Navigate replace to={`/sign-in${query}`} />;
  }
  return <>{children}</>;
};

/**
 * Sign-in/sign-up pages: a signed-in user has nothing to do there. It also fires right
 * after a successful sign-in (the session appears), so it must honor `?next=` as well.
 */
export const GuestOnly = ({ children }: { readonly children: ReactNode }) => {
  const session = authClient.useSession();
  const [searchParams] = useSearchParams();
  if (session.isPending) {
    return <FullPageSpinner />;
  }
  return session.data === null ? (
    <>{children}</>
  ) : (
    <Navigate replace to={safeRedirectPath(searchParams.get("next"))} />
  );
};
