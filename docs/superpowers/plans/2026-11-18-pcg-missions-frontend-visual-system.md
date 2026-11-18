# PCG Missions Frontend Visual-System Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cohesive, accessible, mobile-first visual refinement of the existing PCG Missions staff PWA, including a restructured Overview, corrected shell controls, readable forms, improved light/dark themes, and a faithfully traced single-colour outline loading animation.

**Architecture:** Keep the existing React/Vite application, API clients, auth lifecycle, permission model and route/page state. Add one final visual stylesheet layer for consistent semantic tokens and cross-module presentation, make focused component changes for the shell and Overview, and add a small inline SVG loader whose static vector path data is traced from the existing crest raster. Do not replace backend services or restructure the application wholesale.

**Tech Stack:** React 19, TypeScript, Vite 6, CSS, SVG, Lucide, Vitest. No runtime dependencies are required for the visual redesign or loader.

**Spec:** `docs/superpowers/specs/2026-11-18-pcg-missions-frontend-visual-system-design.md`

## Global Constraints

- Preserve all API contracts, server-authorized projections, role/capability checks, record scopes, authentication lifecycle and current feature gates.
- Do not enable SMS, offline mode, public registration, bulk exports, or any currently disabled capability.
- Do not perform a Cloudflare migration or change deployment hosting.
- Keep `web/public/logo.svg` and `web/public/logo-horizontal.svg` unchanged.
- The crest loading mark is a single-colour outline, no fills, gradients, multiple stroke colours, full-colour reveal, separate spinner, progress percentage, duplicated path, second animation pass, or artificial offset/parallel stroke.
- Trace the shield, both borders, diagonals, central cross, palm tree, ribbon and motto lettering from the actual supplied crest artwork.
- The loading trace itself is the progress indicator. It begins visibly in the first render and draws progressively until the complete crest outline is visible.
- Respect `prefers-reduced-motion`; show the complete static single-colour outline when reduced motion is requested.
- Keep the existing DM Sans family; use readable 14–16 px standard form/body text and 44 px or taller touch controls where practical.
- Red is for genuine error/destructive states, not routine navigation or primary actions. Do not introduce purple, neon accents, excessive gradients or glassmorphism.
- Never represent a paginated 50-record browser preview as a branch-wide total or invent metrics/trends.

## Review Focus

- **Slow or stalled authentication initialization:** loader must remain informative without imposing a minimum animation delay or blocking a ready workspace; verify it is driven only by the existing initialization state.
- **Reduced-motion preference:** the loader and UI transitions must settle to static states without requiring animation events.
- **Small screens and safe areas:** at 320 px width, long names, titles, buttons, keyboard opening and bottom navigation must not overlap or hide form controls.
- **Theme preference and system theme:** saved user choice must persist; first visit must follow system preference; every shell, form, dialog, empty and disabled state must remain legible in both themes.
- **Restricted and paginated sessions:** missing permissions, no records, partial lists and request errors must remain distinguishable and must not reveal data outside server-provided projections.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/src/visual-system.css` | Final-loaded semantic light/dark tokens; shared shell, text, cards, fields, focus, status, responsive and reduced-motion overrides |
| `web/src/main.tsx` | Import the visual-system stylesheet last so legacy styles do not override the final design system |
| `web/src/components/StaffWorkspace.tsx` | Correct shell composition, header action grouping, footer relocation, Overview data/permission wiring and removal of the main footer |
| `web/src/components/OverviewDashboard.tsx` | New presentation-only role-aware Overview component; no API calls or permission inference |
| `web/src/components/OverviewDashboard.test.tsx` | Server-rendered/component-contract tests for honest labels, capability-gated actions and empty/partial states |
| `web/src/components/CrestOutlineLoader.tsx` | Inline SVG loading component with one stroke colour, no fills, accessible status and reduced-motion fallback |
| `web/src/components/CrestOutlineLoader.test.tsx` | SVG contract tests: one stroke colour, no fills, no embedded raster/image, no unrelated spinner |
| `web/src/assets/pcg-crest-outline.ts` | Static compound SVG path data and trace metadata generated from the existing source artwork; no runtime raster processing |
| `web/src/App.tsx` | Replace the image-and-spinner startup brand with the immediate outline loader; keep existing initialization state control |
| `web/src/lib/theme.test.ts` | Extend persisted/system theme resolver tests only if token/theme logic changes |
| `web/package.json` | No new runtime dependency; preserve existing scripts and locked versions |

Do not split or rewrite unrelated business logic in `StaffWorkspace.tsx`. Extract only the Overview presentation to make it independently reviewable.

---

### Task 1: Establish the final semantic visual-system layer

**Files:**
- Create: `web/src/visual-system.css`
- Modify: `web/src/main.tsx`
- Test: `web/src/lib/visual-system.test.ts`

**Interfaces:**
- Consumes existing class names in `production.css`, `styles.css` and `ui-refresh.css`.
- Produces semantic CSS custom properties for canvas, surface, raised surface, text levels, border, primary action, brand accent, success, warning, error and focus.
- The visual-system stylesheet is imported after the current three style sheets.

- [ ] **Step 1: Write failing CSS-contract tests** in `visual-system.test.ts`. Assert the stylesheet defines light and `html[data-theme="dark"]` semantic token sets, and that routine active navigation/primary action styles do not use the error token. Assert required readable input/label and focus-visible rules exist.
- [ ] **Step 2: Run the focused test and confirm it fails** because the new stylesheet does not exist.
- [ ] **Step 3: Add semantic light and dark token definitions** using the approved navy, muted gold and teal-green direction. Use error red only for destructive/error feedback. Keep token values centralised; map current CMI component classes to those tokens.
- [ ] **Step 4: Import `./visual-system.css` last** in `main.tsx`.
- [ ] **Step 5: Add shared states** for body/text hierarchy, links, panels, badges/statuses, buttons, form controls, inputs, selects, textareas, dialogs, table surfaces, placeholder/disabled/read-only, hover, active and keyboard focus.
- [ ] **Step 6: Add responsive and reduced-motion rules** without depending on animation for information or control availability.
- [ ] **Step 7: Run focused and full verification:** `npm test -- src/lib/visual-system.test.ts`, then `npm test`, `npm run typecheck`, and `npm run lint` from `web/`.
- [ ] **Step 8: Commit** as `style: establish PCG Missions semantic visual system`.

### Task 2: Refine the workspace shell, header controls and footer placement

**Files:**
- Modify: `web/src/components/StaffWorkspace.tsx`
- Modify: `web/src/visual-system.css`
- Test: `web/src/components/StaffWorkspace.test.tsx` (server-rendered shell contract; add a test file if no existing one is present)

**Interfaces:**
- Preserve the current `StaffWorkspace` props: `api`, `session`, `onSignOut`.
- Preserve the existing `ThemeToggle` and `refresh()` actions and their pending/disabled behaviour.
- The desktop attribution belongs in the sidebar; the main content footer is removed.

- [ ] **Step 1: Write failing shell-contract tests** for the desktop sidebar attribution, absence of a main-area footer, accessible theme/refresh controls, and presence of mobile navigation.
- [ ] **Step 2: Run the focused tests and confirm they fail** against the current shell markup.
- [ ] **Step 3: Move the existing attribution** into a compact sidebar footer, below account/sign-out controls. Do not duplicate it in the page content.
- [ ] **Step 4: Group theme and refresh controls** in one right-aligned action cluster with equal control dimensions, visible focus, labels and non-overlapping layout. Keep refresh async state and button disabling unchanged.
- [ ] **Step 5: Align desktop and mobile brand identity**: desktop brand stays in the sidebar; mobile top bar shows compact logo/title at the left and action controls at the right. Preserve the exact original logo assets.
- [ ] **Step 6: Remove main footer markup** and hide sidebar attribution at mobile breakpoints. Retain bottom navigation; adjust content bottom padding for its height and device safe-area inset.
- [ ] **Step 7: Run shell tests and verify responsive breakpoints** at 320, 375, 768, 1024 and wide desktop widths. Check long staff names and browser zoom.
- [ ] **Step 8: Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.**
- [ ] **Step 9: Commit** as `style: refine responsive workspace shell and controls`.

### Task 3: Rebuild the Overview as a role-aware operational home

**Files:**
- Create: `web/src/components/OverviewDashboard.tsx`
- Create: `web/src/components/OverviewDashboard.test.tsx`
- Modify: `web/src/components/StaffWorkspace.tsx`
- Modify: `web/src/visual-system.css`

**Interfaces:**
- `OverviewDashboard` is presentation-only; it must not make API calls.
- Pass explicit current-state data, permission booleans and callbacks from `StaffWorkspace`.
- Proposed props:
  - `staffName: string`
  - `branchName: string`
  - `contactCount: number | null`
  - `contactsHasMore: boolean`
  - `tasksHasMore: boolean`
  - `openTasks: FollowUpTask[] | null`
  - `overdueTasks: FollowUpTask[] | null`
  - `completedTaskCount: number | null`
  - `canCreateContact: boolean`
  - `canCreateTask: boolean`
  - `canReadContacts: boolean`
  - `canReadTasks: boolean`
  - `availablePages: Page[]`
  - `onOpenContacts: () => void`
  - `onCreateContact: () => void`
  - `onOpenFollowUp: () => void`
  - `onCreateTask: () => void`
- Keep `Page` exported as a type only if needed by the presentation contract; otherwise pass simple callbacks to avoid leaking workspace navigation internals.

- [ ] **Step 1: Write tests first** for four behaviours: (a) no contact action without contact-create permission; (b) no task action without task-create permission; (c) partial contact/task lists are labelled as loaded previews, not branch totals; (d) no-access and zero-record states are distinct and informative.
- [ ] **Step 2: Run the new focused tests and verify the expected failures.**
- [ ] **Step 3: Implement the Overview component** with this hierarchy: greeting/workspace context; capability-gated quick actions; compact summary; due/overdue priority task list; compact supporting module/access disclosure.
- [ ] **Step 4: Use only current server-provided records.** Do not invent chart values, trend indicators, counts, names or recent activity. Show partial-list context whenever `contactsHasMore` or `tasksHasMore` is true.
- [ ] **Step 5: Keep task previews useful and actionable:** show a small number of the most urgent visible tasks, ordered by due date where available, with an explicit link/action to Follow-up. Do not expose sensitive contact identity fields beyond existing projections.
- [ ] **Step 6: Move detailed module availability/restrictions** into a collapsed “Workspace access” disclosure, retaining accurate current wording about draft-only or disabled capabilities.
- [ ] **Step 7: Show onboarding guidance only when it is genuinely useful** (for example, no loaded contacts and capture permission). Do not leave a permanent multi-step tutorial as the largest element for established workspaces.
- [ ] **Step 8: Replace the current inline Overview block** in `StaffWorkspace.tsx` with the presentation component and pass explicit values/callbacks.
- [ ] **Step 9: Verify all role states:** read-only contact user, capture-only contact user, follow-up-only user, Admin/Pastor with more modules, no available tasks, and partial lists.
- [ ] **Step 10: Run full tests, typecheck, lint and build; commit** as `feat: rebuild role-aware ministry overview`.

### Task 4: Apply the form and data-entry visual language across modules

**Files:**
- Modify: `web/src/visual-system.css`
- Modify as needed, limited to presentation markup/class names:
  - `web/src/components/StaffWorkspace.tsx`
  - `web/src/components/ContactDetailDialog.tsx`
  - `web/src/components/OperationsWorkspace.tsx`
  - `web/src/components/TeamAdministrationWorkspace.tsx`
  - `web/src/components/MinistryReportsWorkspace.tsx`
  - `web/src/components/StaffLogin.tsx`
- Test: `web/src/lib/visual-system.test.ts` and focused component contract tests where markup changes

**Interfaces:**
- Existing form submit handlers, HTML field names, validation constraints, payloads, idempotency keys, API methods and server error handling remain unchanged.
- CSS is shared across form surfaces; use existing form classes before adding new component-specific classes.

- [ ] **Step 1: Add failing CSS contract assertions** for label visibility, 44 px minimum touch targets, 14–16 px entry text, focus, invalid, disabled and read-only states, plus mobile single-column layout.
- [ ] **Step 2: Run the focused tests and confirm failure.**
- [ ] **Step 3: Implement shared form field styling** for labels, helper/optional text, inputs, selects, textareas, search, checkboxes, date/time controls, validation and button rows.
- [ ] **Step 4: Make focus and error states clear** without using red for neutral/normal focus. Ensure error copy remains adjacent to affected fields and does not rely on colour alone.
- [ ] **Step 5: Improve form grouping** with clear section hierarchy, balanced whitespace, consistent radii and mobile stacking. Avoid excessive nested cards.
- [ ] **Step 6: Make only presentation-level markup changes** where existing elements need stable class names or more explicit accessible labels. Do not modify form payload construction or submission logic.
- [ ] **Step 7: Check contact, task, staff, event, calendar, announcement, team, report and password/recovery forms** in light/dark and at 320/375 px.
- [ ] **Step 8: Run full tests, typecheck, lint and build; commit** as `style: improve accessible data-entry surfaces`.

### Task 5: Build the exact single-colour crest-outline loading experience

**Files:**
- Create: `web/src/assets/pcg-crest-outline.ts`
- Create: `web/src/components/CrestOutlineLoader.tsx`
- Create: `web/src/components/CrestOutlineLoader.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/visual-system.css`
- Read only: `web/public/logo.svg` (must not modify)
- Read only: `web/public/logo-horizontal.svg` (must not modify)

**Interfaces:**
- Export `CrestOutlineLoader({ label }: { label?: string })` from `CrestOutlineLoader.tsx`.
- Export the trace path data and view-box metadata from `pcg-crest-outline.ts`.
- Use an inline SVG path so the initial outline does not wait for a separate image/network request.
- One single stroke token is used for the entire crest; all traced regions have `fill="none"`. The loader has no raster image overlay or separate spinner.

- [ ] **Step 1: Extract the original crest raster deterministically** from the embedded JPEG inside `web/public/logo.svg`; keep a copy in a temporary working directory only. Verify its native 600 × 680 view box and inspect the visible source contours.
- [ ] **Step 2: Generate a first trace from the source artwork** using a one-off local Python trace script: extract the embedded JPEG with the standard library, decode it with Pillow, derive edge/colour-region masks with OpenCV, and export nested contours from `cv2.findContours(..., RETR_TREE, CHAIN_APPROX_SIMPLE)` as SVG path data. Keep contour simplification below one source pixel around small text/tree details. Include the shield outer contour, double border, diagonal elements, central cross boundaries, palm tree, ribbon and motto lettering. The script is temporary build tooling; do not add OpenCV/Pillow as application runtime dependencies.
- [ ] **Step 3: Write failing tests** asserting: rendered loader contains an inline SVG; the SVG viewBox preserves 600 × 680 proportions; every visible path has the same one-colour stroke; no path has a fill; there is no `img`/external source overlay; no separate spinner/progress number is rendered; reduced-motion CSS presents the completed outline statically.
- [ ] **Step 4: Run the focused tests and verify they fail** before implementing the loader.
- [ ] **Step 5: Refine the vector path against the original raster**. Render an overlay and a trace-only preview at 600 × 680. Adjust masks/contours until the outline aligns with the source boundaries. Preserve the palm tree fronds/trunk, shield double border, cross negative-space boundaries, ribbon shape and individual motto letter contours. Do not approximate the palm tree or omit banner text. Keep the original logo assets unchanged.
- [ ] **Step 6: Implement `CrestOutlineLoader`** as an inline SVG using only the static trace path data. Use one warm muted-gold stroke on a restrained deep-navy loader surface. Every source contour is rendered once: prohibit duplicated `d` path data, overlapping second strokes, cloned outlines, offset parallel lines and replayed animation passes. Use no fills, multicolour strokes, gradients, shadows or full-colour logo reveal.
- [ ] **Step 7: Animate each original contour exactly once** with SVG stroke-dash progress (or individually sequenced, non-duplicated subpaths with the same stroke). Ensure no path is replayed, duplicated, overlaid or offset to create a double outline. The first outline segment is visible on first paint; the trace proceeds across the complete crest and the finished state remains as one clean single-colour outline. The outline animation is the only progress indicator.
- [ ] **Step 8: Add a static reduced-motion state** that immediately displays the completed single-colour outline, without depending on animation completion.
- [ ] **Step 9: Replace only the existing startup loader markup** in `App.tsx`; keep the existing `initializing` state, auth initialization, and transition into the workspace unchanged. Do not add a minimum display time.
- [ ] **Step 10: Compare the trace and source visually** at the native aspect ratio and at loader display sizes. Verify the shield border, diagonals, cross, palm tree, ribbon contour and every motto letter are represented, each original contour appears once, and no artificial doubled/offset outline is present. If any detail is not sufficiently legible, refine the trace before acceptance.
- [ ] **Step 11: Run loader tests, full tests, typecheck, lint and build; commit** as `feat: add faithful single-colour crest outline loader`.

### Task 6: Cross-module theme, accessibility and responsive regression pass

**Files:**
- Modify: `web/src/visual-system.css`
- Modify only where verified defects require it:
  - `web/src/components/StaffWorkspace.tsx`
  - `web/src/components/ContactDetailDialog.tsx`
  - `web/src/components/OperationsWorkspace.tsx`
  - `web/src/components/TeamAdministrationWorkspace.tsx`
  - `web/src/components/MinistryReportsWorkspace.tsx`
  - `web/src/components/StaffLogin.tsx`
- Tests: existing component and library tests plus any regression tests introduced in earlier tasks

**Interfaces:**
- No new backend behaviour or permissions.
- Keep one consistent token system and use semantic component states across all screens.

- [ ] **Step 1: Run the full suite** to establish the post-feature baseline.
- [ ] **Step 2: Inspect every route/state** for light/dark readability, including tables, dialogs, form fields, empty states, alerts, disabled buttons, skeletons and navigation.
- [ ] **Step 3: Verify responsive views** at 320, 375, 768, 1024 and 1440 px; test mobile navigation, long text, safe-area padding, open dialogs and on-screen keyboard behaviour.
- [ ] **Step 4: Verify accessibility**: keyboard-only operation, visible focus, semantic heading order, field labels, control names, status text independent of colour, and reduced-motion behaviour.
- [ ] **Step 5: Verify capability boundaries** for contact capture/read, task create/read, staff/access requests, and all draft-only/restricted modules. Confirm no denied action becomes available because of the redesign.
- [ ] **Step 6: Verify data integrity copy**: loaded/paginated values never claim to be full-branch totals; restricted personal information remains hidden; errors do not expose private data.
- [ ] **Step 7: Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from `web/`; capture the exact outputs and record any pre-existing failures honestly.**
- [ ] **Step 8: Commit** as `test: verify PCG Missions visual system across themes and screens`.

### Task 7: Pull request and release review

**Files:**
- Create/update as required: PR description and review evidence; no additional production code unless a review finding requires a fix.

- [ ] **Step 1: Review the branch diff** against `main`; confirm the only modified source is within the approved frontend scope plus design/plan documents.
- [ ] **Step 2: Confirm the two original logo source files are unchanged** and backend/database/SMS/Cloudflare files are untouched.
- [ ] **Step 3: Prepare screenshots** of Overview, forms, shell and loader at desktop and mobile sizes, in both light and dark themes.
- [ ] **Step 4: Open a pull request** to `main`, describing scope, visual decisions, accessibility checks, tests, build output and any remaining limitations.
- [ ] **Step 5: Request an independent review** and resolve all valid comments before merging.
- [ ] **Step 6: Merge only after CI and preview verification pass**. Do not claim production readiness based only on a local build.

---

## Final acceptance checklist

- [ ] Overview has a useful operational hierarchy and is not dominated by tutorials or permission inventories.
- [ ] Header logo/page identity, refresh and theme controls are aligned at desktop and mobile widths.
- [ ] Theme palette uses restrained navy, muted gold and teal-green; red is limited to genuine errors/destructive states; no purple.
- [ ] Text contrast, type size, form labels and input readability are improved in both themes.
- [ ] Data-entry surfaces are consistent, accessible and touch-friendly.
- [ ] Footer attribution is in the desktop sidebar and absent from mobile.
- [ ] Loading mark is an exact single-colour outline trace of the original crest, with no fill and no full-colour reveal; the trace itself animates from first stroke to completion.
- [ ] Original `logo.svg` and `logo-horizontal.svg` are unchanged.
- [ ] Existing API behaviour, auth, permissions, feature gates and user data are unchanged.
- [ ] All frontend test, typecheck, lint and build commands pass, and preview verification is complete.
