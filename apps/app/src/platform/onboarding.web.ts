/** The web build has no phone permissions to walk through. */
export const isOnboarded = async (): Promise<boolean> => {
  await Promise.resolve();
  return true;
};

export const markOnboarded = async (): Promise<void> => {
  await Promise.resolve();
};
