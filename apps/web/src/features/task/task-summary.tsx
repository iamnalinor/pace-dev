import type { TaskTag, TaskViewModel } from "@pace/client";

import { type Translate, useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { LinkChip } from "#web/shared/ui/link-chip.tsx";

const tagText = (t: Translate, tag: TaskTag): string => {
  switch (tag.kind) {
    case "importance": {
      return t(`importance.${tag.importance}`);
    }
    case "status": {
      return t(`status.${tag.status}`);
    }
    case "submission": {
      return t(`submission.${tag.submission}`);
    }
  }
};

/** Title, tags, description and the link, all as the user typed them. */
export const TaskSummary = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  return (
    <div className="px-5 pt-0.5">
      <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
        {view.title}
      </h1>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {view.tags.map((tag) => (
          <li
            className={cn(
              "rounded-sm bg-raised px-2 py-1 text-xs",
              tag.kind === "importance" ? "text-fg" : "text-fg2",
            )}
            key={tag.kind}
          >
            {tagText(t, tag)}
          </li>
        ))}
      </ul>
      {view.description !== null && view.description !== "" && (
        <p className="mt-3 text-[13px] leading-normal whitespace-pre-wrap text-fg2">
          {view.description}
        </p>
      )}
      {view.link !== null && <LinkChip className="mt-3" url={view.link.url} />}
    </div>
  );
};
