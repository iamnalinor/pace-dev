# Task 3b — the update notice becomes a strip that slides down from the top (owner's follow-up)

Owner, looking at Task 2's compact card ("New version" + lime "Refresh page" in the sidebar corner): «ваще лучше сделай так
как на olympagg.github.io - чтобы плашка всплывала сверху. так все же красивее чем какое-то уведомление. но цвет там поставь
не зеленый а голубой, чтобы не так акцентировал внимание.»

How olympagg.github.io does it (inspected): a full-width strip at the very top of the page, `sticky top-0 z-40`, ABOVE the
header, inside a wrapper with `overflow-hidden transition-[max-height] duration-300 ease-out` that goes from `max-h-0` to its
height — so it slides down and pushes the page down (it does not cover content). Inside: one centred row
`flex items-center justify-center gap-4 px-4 py-2.5 text-sm`: the text «Мы кое-что поменяли. Перезагрузите, чтобы увидеть
изменения» and a small outlined button «Обновить» (`rounded-md border border-white/40 px-3 py-1 text-sm font-medium`,
hover bg-white/10). Their strip is dark translucent; ours must be **blue**: the quiet indigo token (`bg-accentQuiet`,
text `accentQuietFg`, the button outlined in accentQuietFg at ~40% opacity) — not the lime.

Do (apps/app/src/platform/update-banner.web.tsx and where it is mounted, apps/app/app/_layout.tsx):
- Mount the strip at the top of the app's root layout so the whole app (sidebar + content on a computer; the screen on a
  phone) sits below it and moves down when it opens — not an absolutely positioned card. Slide-down: animate height/max-height
  from 0 over ~300 ms ease-out (reanimated or a CSS transition on web — this is a .web.tsx file so plain CSS via style is fine);
  respect reduced motion (no animation, just appear).
- Copy: EN "We changed a few things. Refresh to see them." + button "Refresh"; RU "Мы кое-что поменяли. Обновите страницу,
  чтобы увидеть изменения" + "Обновить". Replace the `update.ready` / `update.reload` keys (remove unused ones).
- No dismiss button (the owner removed "Later" earlier). Respect the phone's top safe area on the web PWA (env(safe-area-inset-top)).
- Keep `useWaitingWorker` behaviour; Refresh = messageSkipWaiting as now.
- Tests: update the UpdateCard app test (copy, button press calls skip waiting). Screenshot desktop 1280 + phone 390, light +
  dark, with the strip forced open (a temporary hook is fine but remove it before committing) into
  /tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task3b/.
`bun lint`, `bun test:app` green. Commit "The update notice slides down from the top in the quiet blue".
