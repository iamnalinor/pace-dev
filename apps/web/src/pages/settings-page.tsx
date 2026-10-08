import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";

import { useAuth } from "#web/app-state.tsx";
import { ConnectedApps } from "#web/features/oauth/connected-apps.tsx";
import { DigestWindowsControl } from "#web/features/settings/digest-windows-control.tsx";
import { ExportControl } from "#web/features/settings/export-control.tsx";
import { LanguageControl } from "#web/features/settings/language-control.tsx";
import { QuietHoursControl } from "#web/features/settings/quiet-hours-control.tsx";
import { SettingsLinks } from "#web/features/settings/settings-links.tsx";
import { ThemeControl } from "#web/features/settings/theme-control.tsx";
import { TimezoneControl } from "#web/features/settings/timezone-control.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { Card, CardTitle } from "#web/shared/ui/card.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

export const SettingsPage = () => {
  const t = useT();
  const { auth, user } = useAuth();
  const navigate = useNavigate();
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader eyebrow={user?.name ?? t("app.name")} title={t("nav.settings")} />
      <div className="grid gap-3 px-4 pb-6">
        <Card className="grid gap-3">
          <CardTitle>{t("settings.theme")}</CardTitle>
          <ThemeControl />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>{t("settings.language")}</CardTitle>
          <LanguageControl />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>{t("settings.timezone")}</CardTitle>
          <TimezoneControl />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>{t("settings.digestWindows")}</CardTitle>
          <DigestWindowsControl />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>{t("settings.quietHours")}</CardTitle>
          <QuietHoursControl />
        </Card>
        <Card className="grid gap-1">
          <CardTitle>{t("settings.more")}</CardTitle>
          <SettingsLinks />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>{t("settings.export")}</CardTitle>
          <ExportControl />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>{t("settings.connectedApps")}</CardTitle>
          <ConnectedApps />
        </Card>
        <Button
          className="mt-3"
          onClick={async () => {
            await auth.logout();
            await navigate("/login", { replace: true });
          }}
          variant="outline"
        >
          <LogOut aria-hidden="true" strokeWidth={1.75} />
          {t("settings.logout")}
        </Button>
      </div>
    </main>
  );
};
