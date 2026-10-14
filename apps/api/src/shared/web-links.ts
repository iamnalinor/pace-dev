/** A task's page in the web app; on a phone with Pace the App Link opens it in the app. */
export const taskUrl = (webOrigin: string, taskId: string): string => `${webOrigin}/task/${taskId}`;
