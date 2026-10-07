import { useLocation } from "react-router";

import { ConsentFlow } from "#web/features/oauth/consent-flow.tsx";

/** The API's `GET /authorize` redirects MCP clients here with the authorization request intact. */
export const OAuthAuthorizePage = () => {
  const { search } = useLocation();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-4 py-8">
      <ConsentFlow authQuery={search.slice(1)} />
    </main>
  );
};
