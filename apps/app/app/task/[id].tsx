import { useLocalSearchParams } from "expo-router";

import { TaskScreen } from "#app/features/task/task-screen.tsx";

export default function TaskRoute() {
  const { close, id } = useLocalSearchParams<{ close?: string; id: string }>();
  return <TaskScreen id={id} key={id} openClose={close === "1"} />;
}
