import { firebaseProjectOf } from "./firebase-project.ts";

describe("firebaseProjectOf", () => {
  it("reads the project a google-services.json is for", () => {
    const json = {
      client: [],
      project_info: { project_id: "pace-app", project_number: "1234567890" },
    };
    expect(firebaseProjectOf(json)).toBe("pace-app");
  });

  it("is null for a file that names no project, or no file", () => {
    expect(firebaseProjectOf({ project_info: {} })).toBeNull();
    expect(firebaseProjectOf({ project_info: { project_id: "" } })).toBeNull();
    expect(firebaseProjectOf("not json")).toBeNull();
    expect(firebaseProjectOf(null)).toBeNull();
  });
});
