### Task 3.3: `Group`, `ListRow`, `SectionHeader`

**Files:** Create `ui/group.tsx`, `ui/list-row.tsx`, `ui/section-header.tsx` (+ tests); Modify
`ui/row-list.tsx` (keeps `collapsable={false}`, bug-lessons 11).
**Interfaces:** `<Group inset>` (cell bg, `radius.lg`, separators between children, inset to the text
start); `<ListRow leading title subtitle meta trailing onPress selected density="regular|compact">`
(min height 52/44, `row.padX/Y`); `<SectionHeader title count? action? level>`.
- [ ] Failing tests: separators render between rows, not before the first or after the last;
      `selected` adds the leading bar element and `accessibilityState.selected`; `SectionHeader`
      is a heading with the given level and sentence-case text unchanged.
- [ ] Implement; PASS; Commit.

