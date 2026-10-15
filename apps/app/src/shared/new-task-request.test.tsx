import { act, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { NEW_TASK_REQUEST_MS, requestNewTask, useNewTaskRequest } from "./new-task-request.ts";

/** Stands in for Now's composer: counts the forms it was asked to open. */
const NowStandIn = () => {
  const [opened, setOpened] = useState(0);
  useNewTaskRequest(() => {
    setOpened((count) => count + 1);
  });
  return <Text>{`forms opened: ${String(opened)}`}</Text>;
};

describe("requestNewTask", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens the form on a Now that comes to the front right after the request", async () => {
    const runtime = await createTestRuntime();
    requestNewTask();
    await renderScreen(<NowStandIn />, runtime);
    expect(screen.getByText("forms opened: 1")).toBeOnTheScreen();
  });

  it("lets an old request go: a Now shown much later opens no form by surprise", async () => {
    const runtime = await createTestRuntime();
    jest.useFakeTimers({ now: Date.parse("2026-10-14T09:00:00Z") });
    requestNewTask();
    await act(() => {
      jest.setSystemTime(Date.parse("2026-10-14T09:00:00Z") + NEW_TASK_REQUEST_MS + 1);
    });
    await renderScreen(<NowStandIn />, runtime);
    expect(screen.getByText("forms opened: 0")).toBeOnTheScreen();
  });
});
