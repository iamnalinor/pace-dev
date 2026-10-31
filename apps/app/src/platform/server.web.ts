import { API_BASE_URL } from "./api-base.ts";

/**
The web build always talks to the server deployed with it: the API's CORS admits only its own web
origin, so Change server is Android-only (see `server.ts`).
*/
export const readServer = async (): Promise<string> => {
  await Promise.resolve();
  return API_BASE_URL;
};
