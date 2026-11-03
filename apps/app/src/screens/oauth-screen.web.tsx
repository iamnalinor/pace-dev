import { ScrollView } from "react-native";

import { useT } from "#app/app-state.tsx";
import { TelegramWidget } from "#app/auth/telegram-widget.web.tsx";
import { ConsentFlow } from "#app/features/oauth/consent-flow.tsx";
import { useServerInfo } from "#app/platform/server-store.ts";

const navigateTo = (url: string): void => {
  globalThis.location.assign(url);
};

/**
The app's own sign-in (with its bot fallback for a network that blocks the widget), coming back
to this page with the client's request intact: the login screen follows a same-origin `next`.
*/
export const signInPathFor = (location: Pick<Location, "pathname" | "search">): string =>
  `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

/** The API's `GET /authorize` redirects MCP clients here with the authorization request intact. */
export const OAuthScreen = () => {
  const t = useT();
  const { botUsername } = useServerInfo();
  return (
    <ScrollView
      className="flex-1 bg-app"
      contentContainerClassName="mx-auto min-h-full w-full max-w-auth-card justify-center px-4 py-8"
    >
      <ConsentFlow
        authQuery={globalThis.location.search.slice(1)}
        onSignIn={() => {
          navigateTo(signInPathFor(globalThis.location));
        }}
        redirect={navigateTo}
        renderWidget={(onAuth) => (
          <TelegramWidget
            botUsername={botUsername}
            label={t("login.telegram")}
            onAuth={onAuth}
            texts={{
              failed: t("login.widgetFailed"),
              loading: t("login.widgetLoading"),
              slow: t("login.widgetSlow"),
            }}
          />
        )}
      />
    </ScrollView>
  );
};
