import type { ExportSheet } from "@pace/client";

/**
Writes the sheets to an .xlsx file and hands it to the browser as a download. The writer is
loaded only when someone exports, so it never weighs on the first page load.
*/
export const downloadXlsx = async (
  sheets: readonly ExportSheet[],
  fileName: string,
): Promise<void> => {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    sheets.map((sheet) => ({
      data: [
        sheet.columns.map((column) => ({ fontWeight: "bold" as const, value: column })),
        ...sheet.rows.map((row) => row.map((cell) => (cell === null ? null : { value: cell }))),
      ],
      sheet: sheet.name,
      stickyRowsCount: 1,
    })),
  ).toFile(fileName);
};
