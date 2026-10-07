import { useLocation } from "react-router";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { Card } from "#web/shared/ui/card.tsx";
import { PaceMark } from "#web/shared/ui/pace-mark.tsx";

const APP_LINK_HOST = "pace.nalinor.dev";
const ANDROID_PACKAGE = "dev.nalinor.pace";

/** The App Link lands here when Android did not open the app: hand the token over via intent://. */
const readToken = (search: string, hash: string): null | string =>
  new URLSearchParams(search).get("token") ?? new URLSearchParams(hash.slice(1)).get("token");

const intentUrl = (token: string): string =>
  `intent://${APP_LINK_HOST}/app/auth?token=${encodeURIComponent(token)}#Intent;scheme=https;package=${ANDROID_PACKAGE};end`;

export const AppLinkPage = () => {
  const t = useT();
  const { hash, search } = useLocation();
  const token = readToken(search, hash);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-4 py-8">
      <Card className="grid gap-5 px-6 py-8 text-center">
        <PaceMark className="mx-auto size-12" />
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("appLink.title")}</h1>
        {token === null ? (
          <p className="text-sm text-warn" role="alert">
            {t("appLink.missing")}
          </p>
        ) : (
          <>
            <Button asChild size="lg" variant="accent">
              <a href={intentUrl(token)}>{t("appLink.open")}</a>
            </Button>
            <p className="text-sm text-muted">{t("appLink.fallback")}</p>
          </>
        )}
      </Card>
    </main>
  );
};
