/** `expo-background-task` without the native side: registrations are recorded. */
export const createFakeBackgroundTask = () => ({
  BackgroundTaskResult: { Failed: 2, Success: 1 },
  registerTaskAsync: jest.fn(async (_name: string, _options?: object): Promise<void> => {
    await Promise.resolve();
  }),
  unregisterTaskAsync: jest.fn(async (_name: string): Promise<void> => {
    await Promise.resolve();
  }),
});

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
