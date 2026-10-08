import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { ExportControl } from "./export-control.tsx";

const written = vi.hoisted(() => ({
  fileName: "",
  sheets: [] as readonly { readonly sheet: string; readonly data: readonly unknown[] }[],
}));

vi.mock("write-excel-file/browser", () => ({
  default: (sheets: typeof written.sheets) => ({
    toFile: async (fileName: string) => {
      await Promise.resolve();
      written.sheets = sheets;
      written.fileName = fileName;
    },
  }),
}));

describe("ExportControl", () => {
  it("downloads every kind of record as one spreadsheet", async () => {
    const { services } = await artboardServices();
    renderWithProviders(<ExportControl />, { services });
    await userEvent.click(screen.getByRole("button", { name: "Download .xlsx" }));
    await waitFor(() => {
      expect(written.fileName).toBe("pace-2026-10-06.xlsx");
    });
    expect(written.sheets.map((sheet) => sheet.sheet)).toEqual([
      "tasks",
      "subtasks",
      "activities",
      "projects",
      "events",
    ]);
    expect(written.sheets[0]?.data[0]).toContainEqual({ fontWeight: "bold", value: "title" });
  });
});
