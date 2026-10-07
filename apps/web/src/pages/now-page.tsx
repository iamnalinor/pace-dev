import { Settings } from "lucide-react";
import { Link } from "react-router";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

import { PlaceholderPage } from "./placeholder-page.tsx";

export const NowPage = () => {
  const t = useT();
  return (
    <PlaceholderPage
      action={
        <Button asChild size="icon" variant="outline">
          <Link aria-label={t("nav.settings")} title={t("nav.settings")} to="/settings">
            <Settings aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </Button>
      }
      emptyKey="now.empty"
      titleKey="nav.now"
    />
  );
};
