import { LINE_DRAFT_ROUTE, useHandedShare } from "#app/platform/shared-in.ts";
import { NowScreen } from "#app/screens/now-screen.tsx";

/** Now; on the web also where a share to the installed app lands, handed on by /add. */
export default function NowRoute() {
  return <NowScreen compose={useHandedShare()} notesLineDraft={LINE_DRAFT_ROUTE === "index"} />;
}
