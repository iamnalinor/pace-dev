import { render, screen } from "@testing-library/react-native";

import { titleRef } from "./text-props.ts";
import { Text } from "./text.web.tsx";

/**
The web's Text declares a cut text the way the overflow sweep reads it (`e2e/worst-case.e2e.ts`,
bug-lessons 109): `data-text-policy` and the full value in the `title`, which react-native-web
does not forward, so the element gets it from a ref.
*/
describe("Text on the web", () => {
  it("marks a truncated value", async () => {
    await render(
      <Text policy="truncate" role="footnote">
        A very long project name
      </Text>,
    );
    expect(screen.getByText("A very long project name").props["dataSet"]).toEqual({
      textPolicy: "truncate",
    });
  });

  it("marks a clamp the same way", async () => {
    await render(
      <Text lines={4} policy="clamp" role="callout">
        An inbox capture
      </Text>,
    );
    expect(screen.getByText("An inbox capture").props["dataSet"]).toEqual({ textPolicy: "clamp" });
  });

  it("marks a cut text built of parts when the caller gives its full value", async () => {
    await render(
      <Text full="Ann Lee" policy="truncate" role="footnote">
        {"Ann"} {"Lee"}
      </Text>,
    );
    expect(screen.getByText("Ann Lee").props["dataSet"]).toEqual({ textPolicy: "truncate" });
  });

  it("leaves a cut text built of parts unmarked without its full value (the sweep reports it)", async () => {
    await render(
      <Text policy="truncate" role="footnote">
        {"Ann"} {"Lee"}
      </Text>,
    );
    expect(screen.getByText("Ann Lee").props["dataSet"]).toBeUndefined();
  });

  it("leaves wrapping text unmarked", async () => {
    await render(<Text role="body">Save</Text>);
    expect(screen.getByText("Save").props["dataSet"]).toBeUndefined();
  });

  it("writes a cut text's full value into the element's title", () => {
    const setAttribute = jest.fn();
    titleRef("truncate", "A very long project name")?.({ setAttribute });
    expect(setAttribute).toHaveBeenCalledWith("title", "A very long project name");
    titleRef("clamp", 1284)?.({ setAttribute });
    expect(setAttribute).toHaveBeenCalledWith("title", "1284");
  });

  it("titles nothing that wraps, and nothing that is not plain text", () => {
    expect(titleRef("wrap", "Save")).toBeUndefined();
    expect(titleRef("truncate", ["Ann", " ", "Lee"])).toBeUndefined();
  });
});
