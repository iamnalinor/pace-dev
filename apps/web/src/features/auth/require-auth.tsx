import { Navigate, Outlet, useLocation } from "react-router";

import { useAuth } from "#web/app-state.tsx";

/** Gate for the authenticated layout: signed-out visitors go to /login and come back via ?next=. */
export const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();
  switch (status) {
    case "loading": {
      return null;
    }
    case "signed-out": {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      return <Navigate replace to={`/login?next=${next}`} />;
    }
    case "signed-in": {
      return <Outlet />;
    }
  }
};
