# Task 16 — Part I: APK to Telegram after a release; the second Groq key

Owner's words: «Скок щас апкшки весят? Боты вроде могут отправлять меньше 50мб. Давай после релиза кидать мне новые апк в лс в
телегу. Мой id <owner Telegram id>, давай положим в variables (скажи какой или добавь сам если можешь). Плюс мы там сделали фичу чтобы у
нас было два groq токена, скажи где и как добавить второй». (The APK is ~25 MB.)

1. .github/workflows/release.yml: after the GitHub release is published (the softprops/action-gh-release step), a step
   "Send the APK to Telegram" that runs only when `vars.TELEGRAM_RELEASE_CHAT_ID != ''`: `curl -sS --fail-with-body -F
   chat_id=${{ vars.TELEGRAM_RELEASE_CHAT_ID }} -F document=@<apk path> -F caption="Pace vX.Y.Z — <release url>"
   https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument` with the token from `secrets.TELEGRAM_BOT_TOKEN` passed via
   `env:` (never inline the secret in the command line text; mask it). Fail the step if the APK is over 50 MB with a clear
   message (check size first with `stat`). Keep the existing steps unchanged otherwise. Check how the release job names and
   locates the APK and the release URL (outputs of the gh-release step: `steps.<id>.outputs.url`).
2. .github/workflows/deploy.yml ~L98-104: GROQ_API_KEY and GEMINI_API_KEY are trimmed with `tr -d '[:space:]'`, which glues
   newline-separated keys into one. Make newlines (and spaces) between keys become commas and trim the ends, e.g.
   `printf '%s' "$KEY" | tr -s '[:space:],' ',' | sed 's/^,//; s/,$//'`, for both keys; keep TELEGRAM_BOT_TOKEN's trim as is.
   apps/api/src/shared/config.ts already splits on commas or whitespace — confirm.
3. README (~L210): document both secrets as "one or more keys separated by commas (or one per line)", and add to the release
   section: "Set the repository variable TELEGRAM_RELEASE_CHAT_ID to your Telegram user id to get each release's APK from the
   bot (open the bot once first)". Also docs that the APK is about 25 MB (arm64-v8a).
4. Lint the workflows if the repo has actionlint in `bun lint` (check); otherwise validate YAML syntax with a quick parse
   (`bunx js-yaml` or `python3 -c 'import yaml'` if available) and paste the result in the report.
Commit: "Release: the APK goes to the owner in Telegram; several Groq keys one per line work".
