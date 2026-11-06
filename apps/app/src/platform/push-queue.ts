/** Native-compatible queue: caller failures propagate while the next operation can recover. */
export const createPushQueue = () => {
  const tail = { value: Promise.resolve() };
  return async (work: () => Promise<void>): Promise<void> => {
    const previous = tail.value;
    let release: (() => void) | undefined;
    tail.value = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      await work();
    } finally {
      release?.();
    }
  };
};
