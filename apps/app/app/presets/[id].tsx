import { useLocalSearchParams } from "expo-router";

import { PresetScreen } from "#app/screens/preset-screen.tsx";

export default function PresetRoute() {
  const { from, id } = useLocalSearchParams<{ from?: string; id: string }>();
  return <PresetScreen from={from} id={id} key={id} />;
}
