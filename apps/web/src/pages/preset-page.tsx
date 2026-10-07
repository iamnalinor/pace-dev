import { useParams, useSearchParams } from "react-router";

import { PresetEditor } from "#web/features/presets/preset-editor.tsx";

/** `/settings/presets/new?from=<parent>` creates; `/settings/presets/<id>` edits. */
export const PresetPage = () => {
  const { id = "new" } = useParams();
  const [search] = useSearchParams();
  return (
    <main className="flex flex-1 flex-col">
      <PresetEditor from={search.get("from")} presetId={id === "new" ? null : id} />
    </main>
  );
};
