import { Link } from "react-router";

import type { ReviewRow } from "@pace/client";
import type { ReviewActionKey } from "@pace/core";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

type Props = {
  readonly row: ReviewRow;
  /** The relative day of `row.since`, already formatted. */
  readonly since: string;
  readonly onAction: (key: ReviewActionKey) => void;
};

/** The first action is the suggested one and gets the filled button. */
export const ReviewCard = ({ onAction, row, since }: Props) => {
  const t = useT();
  return (
    <li className="grid gap-3 rounded-xl border border-line bg-surface p-3.5">
      <div className="grid gap-1">
        <p className="text-sm font-medium">{t(`review.kind.${row.kind}`)}</p>
        <Link className="text-[15px] text-fg hover:underline" to={`/task/${row.taskId}`}>
          {row.title}
        </Link>
        <p className="text-xs text-muted">{t("review.since", { when: since })}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {row.actions.map((key, index) => (
          <Button
            key={key}
            onClick={() => {
              onAction(key);
            }}
            size="sm"
            variant={index === 0 ? "default" : "secondary"}
          >
            {t(`review.action.${key}`)}
          </Button>
        ))}
      </div>
    </li>
  );
};
