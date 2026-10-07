import { ExternalLink, Link2 } from "lucide-react";
import { useState } from "react";

import { useLinkPreview } from "#web/shared/lib/use-link-preview.ts";
import { cn } from "#web/shared/lib/cn.ts";

type Props = {
  readonly url: string;
  readonly className?: string;
};

/**
A task's link the way a calendar shows an attachment: the site's icon, the page title and
the host, opening in a new tab.
*/
export const LinkChip = ({ className, url }: Props) => {
  const preview = useLinkPreview(url);
  const [isIconBroken, setIconBroken] = useState(false);
  return (
    <a
      className={cn(
        "flex min-h-11 max-w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-inherit no-underline outline-none hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-accent/40",
        className,
      )}
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      {preview.icon !== null && !isIconBroken ? (
        <img
          alt=""
          className="size-4 shrink-0 rounded-sm"
          onError={() => {
            setIconBroken(true);
          }}
          src={preview.icon}
        />
      ) : (
        <Link2 aria-hidden="true" className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{preview.title ?? preview.host}</span>
        {preview.title !== null && (
          <span className="truncate font-mono text-[11px] text-muted">{preview.host}</span>
        )}
      </span>
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} />
    </a>
  );
};
