### Task 3.2: `Text` roles, `Icon`, `Link`

**Files:** Create `ui/text.tsx`, `ui/icon.tsx`, `ui/link.tsx` (+ tests); Modify every `lucide-react-native`
import site to `Icon` (codemod), `ui/sidebar.tsx`/`tab-bar.tsx` links.
**Interfaces:** `<Text role="body" tone="primary|secondary|tertiary|accent|danger|warn" numeric
policy="truncate|wrap|clamp" lines={n} level?>` (heading `level` → `aria-level` + role heading);
`<Icon name size="inline|control|bar" tone>` (stroke 1.75, `absoluteStrokeWidth`); `<Link href>` (web
`<a href>` via expo-router `Link asChild`).
- [ ] Failing tests: `policy="truncate"` sets `numberOfLines=1` **and** `flexShrink: 1, minWidth: 0`;
      `level={2}` renders role heading with level 2; `Icon` passes `strokeWidth={1.75}` at every size;
      `Link` renders an `a` with `href` on web (e2e: Ctrl-click opens a new page).
- [ ] Implement; PASS; lint guard: forbid `numberOfLines` on raw RN `Text` outside `ui/text.tsx`
      (F-DAT-02 class guard) and raw `lucide-react-native` imports outside `ui/icon.tsx`.
- [ ] Bug-lessons: F-DAT-02 new class "Text from data in a flex row without a shrink rule"; sweep
      every `ColorTag`/label (Task 3.9, 4.x finish it). Commit.

