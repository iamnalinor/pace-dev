import { useSearchParams } from "react-router";

import { NowScreen } from "#web/features/now/now-screen.tsx";

/** `/add` (and the share target, `?text=`): Now with the composer expanded and filled in. */
export const AddPage = () => {
  const [params] = useSearchParams();
  const shared = [params.get("title"), params.get("text"), params.get("url")]
    .filter((part) => part !== null && part !== "")
    .join(" ");
  return <NowScreen composeText={shared} isComposerExpanded />;
};
