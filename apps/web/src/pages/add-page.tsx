import { useSearchParams } from "react-router";

import { NowSplit } from "#web/features/now/now-split.tsx";

/** `/add` (and the share target, `?text=`): Now with the composer expanded and filled in. */
export const AddPage = () => {
  const [params] = useSearchParams();
  const shared = [params.get("title"), params.get("text"), params.get("url")]
    .filter((part) => part !== null && part !== "")
    .join(" ");
  return <NowSplit composeText={shared} isComposerExpanded />;
};
