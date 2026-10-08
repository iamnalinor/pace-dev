/** `expo-background-task` and `expo-task-manager` without the native side: tasks are recorded. */
export const createFakeBackgroundTask = () => ({
  BackgroundTaskResult: { Failed: 2, Success: 1 },
  BackgroundTaskStatus: { Available: 2, Restricted: 1 },
  getStatusAsync: async (): Promise<number> => 2,
  registerTaskAsync: jest.fn(async (): Promise<void> => {
    await Promise.resolve();
  }),
});

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
