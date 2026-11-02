/**
The app's message catalogs, for checks that read what a screen may say (raw keys, empty states) or
find a control by its Russian name. Read from core's files themselves: core's entry also imports a
JSON module, which Playwright's loader refuses without an import attribute.
*/
// eslint-disable-next-line import-x/no-relative-packages -- core's entry cannot load under Playwright (see above)
export { en } from "../../packages/core/src/i18n/en.ts";
// eslint-disable-next-line import-x/no-relative-packages -- core's entry cannot load under Playwright (see above)
export { formatDuration } from "../../packages/core/src/i18n/i18n.ts";
// eslint-disable-next-line import-x/no-relative-packages -- core's entry cannot load under Playwright (see above)
export { ru } from "../../packages/core/src/i18n/ru.ts";
