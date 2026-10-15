/**
The Firebase project a google-services.json is for (`project_info.project_id`); `null` when it
names none. The build carries it (`extra.firebaseProject`) so the app can tell whether a server
sends with the same project: FCM refuses every push to a token of another project
(`SENDER_ID_MISMATCH`), so such a phone polls instead.
*/
export const firebaseProjectOf = (json: unknown): null | string => {
  if (typeof json !== "object" || json === null || !("project_info" in json)) {
    return null;
  }
  const info: unknown = json.project_info;
  const id: unknown =
    typeof info === "object" && info !== null && "project_id" in info ? info.project_id : null;
  return typeof id === "string" && id !== "" ? id : null;
};
