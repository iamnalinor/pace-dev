import { useT } from "#web/i18n.tsx";
import { Card } from "#web/shared/ui/card.tsx";
import { PaceMark } from "#web/shared/ui/pace-mark.tsx";

/** The API redirects MCP clients here; the consent flow itself arrives with stage 1 (plan 1.9). */
export const OAuthAuthorizePage = () => {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-4 py-8">
      <Card className="grid gap-4 px-6 py-8">
        <PaceMark className="size-10" />
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("oauth.title")}</h1>
        <p className="text-sm text-muted">{t("oauth.body")}</p>
      </Card>
    </main>
  );
};
