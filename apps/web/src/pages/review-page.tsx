import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

import { ReviewList } from "#web/features/review/review-list.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

export const ReviewPage = () => {
  const t = useT();
  return (
    <main className="flex flex-1 flex-col pb-6">
      <header className="flex items-center gap-1 px-2 pt-3.5 pb-3">
        <Button aria-label={t("common.back")} asChild size="icon" variant="ghost">
          <Link to="/">
            <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </Button>
        <h1 className="text-[22px] font-semibold">{t("review.title")}</h1>
      </header>
      <ReviewList />
    </main>
  );
};
