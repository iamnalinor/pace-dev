import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";

/** "To sort · 2": what the system could not settle on its own, shown only when there is some. */
export const ReviewLink = () => {
  const t = useT();
  const { count } = useServices().hooks.useReview();
  if (count === 0) {
    return null;
  }
  return (
    <Link
      className="mx-4 mb-3 flex min-h-11 items-center justify-between rounded-xl border border-question/40 bg-surface px-3.5 text-[13px] text-fg no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
      to="/review"
    >
      <span>{t("now.toSort", { count })}</span>
      <ChevronRight aria-hidden="true" className="size-4 text-muted" strokeWidth={1.75} />
    </Link>
  );
};
