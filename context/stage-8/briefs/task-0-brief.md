# Task 0 — context docs for feedback round 4

Write three docs changes in /home/user/pace-dev/context (no code):

1. New `context/feedback-4.md`, in the same format as `context/feedback-3.md` (read it first):
   title `# Feedback round 4 («pace замечания 4», 2026-10-13)`, an intro paragraph saying it is the
   owner's fourth feedback document verbatim as text, screenshots replaced by descriptions in
   [brackets] as quoted `> [Screenshot: …]` lines, and that what was done about each point is in
   `plan.md` (Stage 8). The verbatim text with image markers is in
   `.superpowers/sdd/root-claude-uploads-cb223545-7465-5720-iridescent-cat/feedback-4-raw.txt`;
   replace each `[[IMG rIdN]]` with the description from `screenshots.md` in the same folder.
   Keep the owner's Russian text exactly as written (typos, swearing and all). Append a final
   section `## The extra screenshot` with the extra-screenshot description and the owner's question verbatim.
2. `context/user-messages.md`: append a section `## 2026-10-13, stage 8 session` (same style as the
   existing stage 7 section at the end) with: the document came with no request text beyond the
   file; then the owner's answers while planning:
   - ActivityWatch → «Own agent» (our own Python agent, no ActivityWatch);
   - notification kinds → «Two + keep the timers» (Login and Deadline Digest in the shared pool; Android keeps the "still doing this?" and calendar-start local timers);
   - notifications in the browser → «Feed in the app» (no Web Push);
   - tabs → «Tasks -> Now обратно, Activity -> Day Activity. дальше calendar inbox more», then clarified as «Now·Day·Calendar·Inbox·More» (Now and Day keep their names; Week becomes Calendar);
   - then the extra screenshot with «еще такой фидбек. что ему здесь не нравится? и опять же почему мы такое не ловим на этапе QA».
3. `context/plan.md`: insert at the top (after the header lines, before `## Stage 7 plan`) a section
   `## Stage 8 plan (current — feedback round 4; 2026-10-13)` that says: document `feedback-4.md`;
   the plan was approved in the session; a short bullet list of the parts (A bugs, B visual and
   navigation, C time bar, D reset + unified sessions + login notices + 2FA wipe/delete, E notification
   pool, F assistant proposals in app and bot, G automatic sleep, H own desktop agent, I release APK to
   Telegram); and an empty `### Что сделано по каждому пункту` table header (| Замечание | Решение |) to be
   filled at the end. Change the Stage 7 heading's "(current — …" to "(done — …".
4. `context/README.md`: add a row for feedback-4.md to the table (like feedback-3.md's row).

Commit as "context: feedback round 4 verbatim, the stage 8 plan". `bun lint` must pass (it formats markdown? check; run it).
