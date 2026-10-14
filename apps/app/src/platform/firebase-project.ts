import Constants from "expo-constants";

/**
The Firebase project this build was made with (its google-services.json, see app.config.ts);
`null` in a build without Firebase, and on the web.
*/
export const appFirebaseProject = (): null | string => {
  const value: unknown = Constants.expoConfig?.extra?.["firebaseProject"];
  return typeof value === "string" && value !== "" ? value : null;
};
