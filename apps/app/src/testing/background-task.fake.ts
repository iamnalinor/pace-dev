/** `expo-task-manager` without the native side: tasks are recorded. */
export const createFakeTaskManager = () => {
  const tasks = new Map<string, () => Promise<unknown>>();
  return {
    defineTask: (name: string, run: () => Promise<unknown>): void => {
      tasks.set(name, run);
    },
    isTaskRegisteredAsync: async (): Promise<boolean> => false,
    tasks,
  };
};
