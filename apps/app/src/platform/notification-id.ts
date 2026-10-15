/** The pool id a notification response or a tapped notification carries, if any. */
export const notificationIdOf = (data: unknown): null | string => {
  const id: unknown =
    typeof data === "object" && data !== null && "notificationId" in data
      ? data.notificationId
      : null;
  return typeof id === "string" ? id : null;
};
