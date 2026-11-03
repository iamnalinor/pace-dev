import { renderToStaticMarkup } from "react-dom/server";

import { FieldLabel } from "./field-label.web.tsx";

// The markup react-native-web writes for the label's text.
jest.mock("react-native/Libraries/Text/Text", () => ({
  __esModule: true,
  default: jest.requireActual<{ Text: unknown }>("react-native-web").Text,
}));

describe("a field's label on the web (spec §4.2.28, F-A11Y-15)", () => {
  it("is a <label for> the field's id: a click on it focuses the field", () => {
    const html = renderToStaticMarkup(
      <FieldLabel fieldId="title-1" isDisabled={false} text="Title" />,
    );
    expect(html).toMatch(/^<label for="title-1"[^>]*>.*Title.*<\/label>$/u);
  });
});
