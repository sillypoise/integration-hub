# Stage 5 Report: Operational User Interface

## Status

Implementation and local validation complete. Hosted CI and Railway verification are pending.

## Delivered

- Public introduction with explicit Independent Project, Product Concept, and simulator labels.
- Demo entry that resumes a valid workspace or creates an isolated one on explicit user action.
- Responsive overview, paginated run list, run detail, and synthetic-event controls.
- Database-derived overview totals and six recent runs through a new scoped overview endpoint.
- Page-local status filtering, safe source/mapped-result display, attempts, timeline, and trace IDs.
- Native form validation, safe replay feedback, and a clearly labeled fresh-workspace action.
- Loading, empty, unavailable, unauthorized, not-found, stale, accepted, and successful states.
- Active-detail polling limited to 30 requests / 60 seconds, with five-second request deadlines, no
  overlapping reads, and cleanup on navigation. Lists and overview are manually refreshed snapshots.

## Validation

- 130 unit/integration tests passed with 99.11% statement coverage in the configured server/contract
  coverage scope. This percentage is not a claim of React component coverage.
- 24 Chromium Playwright checks passed across desktop (1280 × 720) and Pixel 7 mobile emulation (412
  × 839 CSS viewport). The real UI flow creates an update, inspects success, proves duplicate
  convergence, filters runs, and starts a fresh workspace.
- Controlled response and clock tests verify loading, dependency errors, stale snapshots, refresh,
  terminal polling stop, navigation cleanup, and the hard polling bound. These are UI tests, not
  claims of observed provider failure behavior.
- Formatting, type-aware lint, typecheck, and production build passed. Browser bundle inspection
  found no `DATABASE_URL`, `p1_token_hash`, or `postgresql://` strings in emitted static JavaScript.
- Five-view screenshots are generated under `test-results/` by the operational UI browser test.
  Desktop landing/overview/detail and mobile overview/controls/detail were visually reviewed.

## Accessibility review

- Native labeled number inputs/selects/buttons, headings, table headers, UTC time labels,
  current-page navigation, polite status updates, and safe error alerts are present.
- Keyboard checks verify the skip link, main focus target, visible control focus, and invalid-input
  focus. The overflow table is a labeled, keyboard-focusable scroll region. It has one documented
  narrow lint suppression because non-interactive scroll containers require keyboard access.
- No page-level horizontal overflow was observed in the tested overview and run-list viewports.
- WCAG relative-luminance calculations from the declared CSS colors give body text 14.30:1, muted
  text 5.54:1, primary-button text 5.32:1, neutral badges 5.89:1, and sidebar text 9.90:1.
  Form-control borders are 3.67:1 against white. The sidebar uses its own light focus outline after
  the initial blue outline measured only 2.47:1 on the dark background.
- Reduced motion is respected. This focused review is not a full accessibility certification or
  evidence from physical mobile devices / assistive-technology user testing.

## Decisions and scope

- No dependency or generic UI framework was added. Native controls cover current interactions;
  shadcn/ui remains deferred until a widget needs it (`SIMPLE-ADMIT-003`).
- The public shell is statically rendered; client components consume validated, non-cacheable
  existing APIs. This reuses the tested cookie boundary and never passes tokens into page props. The
  tradeoff versus server-fetched private pages is an extra HTTP read and an intentional loading
  state. At most one read is active per view; only active details poll.
- The new overview query scans at most 1,000 workspace runs and returns six rows plus four counts. A
  conservative 16 KiB planning allowance per detail response gives about 480 KiB for 30 reads,
  excluding protocol overhead. This is an estimate, not response-size enforcement or a benchmark.
- Stage 5 and Stage 6 both previously mentioned reset. Stage 5 now explicitly offers a fresh
  workspace, not deletion: the previous workspace expires normally. Audited destructive reset and
  manual/provider retry remain Stage 6 work.

## Contract delta

`GET /api/demo/overview` is additive; there are no migrations, changed existing HTTP errors, or
changes to persisted transitions. Shared run-state schemas moved to a browser-safe module while
existing server exports remain compatible. See [`../contracts.md`](../contracts.md).

## Next

Stage 6: deterministic failure scenarios, bounded domain retries, manual recovery, and audited
reset.
