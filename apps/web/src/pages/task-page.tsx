import { useParams } from "react-router";

import { TaskScreen } from "#web/features/task/task-screen.tsx";

export const TaskPage = () => {
  const { id = "" } = useParams();
  // Keyed by id: moving between tasks starts with fresh sheets.
  return <TaskScreen key={id} taskId={id} />;
};
