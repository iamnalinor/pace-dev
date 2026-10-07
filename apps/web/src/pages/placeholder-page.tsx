import type { ReactNode } from "react";

import type { MessageKey } from "@pace/core";

import { useT } from "#web/i18n.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

type Props = {
  readonly titleKey: MessageKey;
  readonly emptyKey: MessageKey;
  readonly action?: ReactNode;
};

/** A tab that has no content yet: the artboard header and one empty-state line. */
export const PlaceholderPage = ({ action, emptyKey, titleKey }: Props) => {
  const t = useT();
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader action={action} title={t(titleKey)} />
      <p className="px-5 py-8 text-sm text-muted">{t(emptyKey)}</p>
    </main>
  );
};
