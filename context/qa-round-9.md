# QA round 9 — PR 1 web build

Tester: Codex exploratory QA agent, 2026-10-15. This targeted browser pass covers the
post-QA8 locale, Week, computer setup, and privacy-related logout changes. The app was
exported from checkout `287610e` plus the then-uncommitted PR 1 edits. The exact web
bundle tested was `entry-18511e896a5d9da6ea6f262a7dc3649b.js`, SHA-256
`404bfdde9902d87735d7742a637f07a449f613ce8e562905745ae3e4d3f1e048`.
The Worker used fresh local state under `/tmp/pace-qa9/state`, `ENVIRONMENT=test`,
`LLM_PROVIDER=fake`, and QA-only Telegram IDs. The web and Worker ran on isolated ports
4174 and 8788. Scripts, JSON observations, and screenshots are in `/tmp/pace-qa9/`.

## Summary

| Severity | New findings |
|---|---:|
| Blocker | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Cosmetic | 0 |

No product defect was reproduced in this targeted web pass. Browser page exceptions,
console errors, and Worker HTTP errors were absent from the recorded cases.

## Coverage and observations

- **Locale and logout:** Four real UI sequences covered Russian and English browser locales,
  390×844 and 1440×900, light and dark. Each went from guest login through dev login,
  Settings language change, Log out, a protected `/week` deep link, and relogin. Russian
  guests had Russian copy and `<html lang="ru">`; English guests had English copy and
  `lang="en"`. An account's chosen language returned on relogin. After Log out the session
  key was gone, the protected route redirected to `/login`, and the guest language followed
  the browser again. `/tmp/pace-qa9/locale-logout.json` records all 24 phases; examples:
  `/tmp/pace-qa9/ru-RU-light-390-after-logout.png` and
  `/tmp/pace-qa9/en-US-dark-390-relogin-account-language.png`.
- **Cross-account privacy:** Seeded a task in account 8001, confirmed it on Now, logged out
  by clicking Settings → Log out, then signed into account 8003 in the same browser context.
  The first account's task was absent from the guest page and account 8003; the session key
  was removed between accounts. The account language changed from EN to RU as expected.
  No browser or Worker errors. `/tmp/pace-qa9/account-switch.json` and
  `/tmp/pace-qa9/account-two-after-switch.png`.
- **Computer setup:** Four UI sequences at both widths, themes, and languages opened
  Devices → Add a computer, named it, created a token, clicked every OS choice, copied the
  token, and closed the sheet with Escape. All 12 install commands were present and lacked
  both the generated token and a `--token`/bearer argument. The one-time token appeared in
  a separate block; Copy token placed that exact value on the clipboard and showed copied
  feedback. All four sheets closed on Escape. The token is deliberately omitted from the
  JSON report. `/tmp/pace-qa9/devices-week.json` and screenshots such as
  `/tmp/pace-qa9/ru-RU-dark-1440-devices-Windows.png` and
  `/tmp/pace-qa9/en-US-dark-390-devices-Linux.png`.
- **Week sideways content:** Both phone cases showed the localized scroll cue. The days
  region had `tabindex="0"`, accepted focus, and ArrowRight moved it from 144 to 170 px.
  At desktop width there was no unnecessary cue. No page-level horizontal overflow at
  either width. `/tmp/pace-qa9/devices-week.json`,
  `/tmp/pace-qa9/ru-RU-light-390-week.png`, and
  `/tmp/pace-qa9/en-US-light-1440-week.png`.

## Surface limits and owner requests

The phone calendar privacy switch is native-only (`IS_PHONE`), so a 390 px web viewport
cannot exercise it. The same is true of actual Android notification cleanup, Firebase
delivery, and the owner's device-only “Add a computer does nothing” report. These still
need a physical Android pass. The browser did verify the shared logout and account-data
boundary. Real agent installation and its hidden token prompt were not run on a computer;
this pass verified the generated instructions, commands, and clipboard behavior.

Proposal cards, bot proposals, apps during an activity, Telegram delete confirmation,
automatic sleep, and sessions/login notices are assigned to later PRs in
`context/stage-8/README.md`; this report does not count them as PR 1 defects. The full
every-form entry-path sweep in `docs/qa.md` was covered by earlier rounds and tests,
and was not repeated in this targeted post-fix pass.
