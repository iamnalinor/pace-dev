import { useLocalSearchParams } from "expo-router";

import { TaskScreen } from "#app/features/task/task-screen.tsx";

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskScreen id={id} key={id} />;
}
