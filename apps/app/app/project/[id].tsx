import { useLocalSearchParams } from "expo-router";

import { ProjectScreen } from "#app/screens/project-screen.tsx";

export default function ProjectRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectScreen id={id} key={id} />;
}
