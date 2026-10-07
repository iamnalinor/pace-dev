import { useParams } from "react-router";

import { NowSplit } from "#web/features/now/now-split.tsx";
import { TaskScreen } from "#web/features/task/task-screen.tsx";

/** A task: its own page on a phone, the right pane beside Now from 1024px. */
export const TaskPage = () => {
  const { id = "" } = useParams();
  // Keyed by id: moving between tasks starts with fresh sheets.
  return <NowSplit pane={<TaskScreen key={id} taskId={id} />} />;
};
