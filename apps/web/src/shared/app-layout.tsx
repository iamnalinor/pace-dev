import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "react-router";

import { authClient } from "#web/shared/auth/auth-client.ts";
import { useCurrentUser } from "#web/shared/auth/use-current-user.ts";
import { Button } from "#web/shared/ui/button.tsx";

const UserMenu = () => {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (currentUser.data === undefined) {
    return null;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{currentUser.data.name}</span>
      <Button
        onClick={async () => {
          await authClient.signOut();
          // Cached data belongs to the previous user.
          queryClient.clear();
          await navigate("/sign-in", { replace: true });
        }}
        size="sm"
        variant="outline"
      >
        Sign out
      </Button>
    </div>
  );
};

export const AppLayout = () => (
  <div className="min-h-dvh">
    <header className="border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4"
      >
        <Link className="font-semibold" to="/">
          Template
        </Link>
        <UserMenu />
      </nav>
    </header>
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Outlet />
    </main>
  </div>
);
