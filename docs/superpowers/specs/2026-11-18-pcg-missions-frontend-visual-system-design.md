# PCG Missions — Frontend Visual-System Refinement

**Date:** 18 November 2026  
**Status:** Proposed design — awaiting product-owner approval  
**Repository:** `Elgit4/PCG_Missions`  
**Frontend:** `web/`  
**Design branch:** `design/pcg-missions-frontend-visual-system`

## 1. Intent

Refine the existing PCG Missions staff PWA into a cohesive, production-grade experience. The highest-priority problems are the overcrowded overview, inconsistent logo/header controls, weak text visibility, an uncomfortable red-led dark theme, cramped or plain data-entry controls, and a footer that consumes valuable mobile space.

This is a visual-system and interaction-quality project. It is not a backend rewrite. Existing workflows, permission boundaries, service calls, user data, and the six-role authorization model must continue to work.

The user has approved the comprehensive visual-system approach and clarified the logo constraint:

> Preserve the exact existing PCG Missions crest. Trace its existing outline and details faithfully; do not redesign, simplify, reinterpret, or recolour it.

## 2. Current implementation inspected

The default branch is `main`. The existing Vite frontend is in `web/` and uses React 19, TypeScript, Tailwind CSS 4, Lucide icons, DM Sans, Fraunces, and Vitest.

Relevant implementation:

- `web/src/App.tsx` owns authentication initialization and currently renders the startup loader.
- `web/src/components/StaffWorkspace.tsx` owns the staff shell, navigation, overview, contacts, follow-up, staff and access-request experiences, and the page footer.
- `web/src/lib/theme.tsx` owns persisted light/dark preference and the theme toggle.
- `web/src/styles.css`, `web/production.css`, and `web/src/ui-refresh.css` are loaded in that order by `web/src/main.tsx`. The later stylesheet layers contain overlapping and overriding shell, form, mobile and theme rules.
- The current top bar places `ThemeToggle` and refresh actions together, but their visual grouping and spacing need to be made deliberate and consistent across breakpoints.
- The current main-area footer contains “PCG Missions · Staff operations” and “Powered by ElTech”.
- The current Overview consists mainly of four record-count cards, an always-visible three-step onboarding panel, and large permission/availability disclosures. It has no clear operational priority hierarchy.
- The current client fetches up to 50 contacts and 50 follow-up tasks for the workspace. The overview must not present these partial client-side lists as complete branch-wide analytics.
- The existing `web/public/logo.svg` is an SVG wrapper around an embedded JPEG raster image (600 × 680 view box), not a true vector crest. It visibly contains a double shield border, diagonal white elements, a red central cross, a green palm tree, and a curved motto banner with lettering. `logo-horizontal.svg` is also an existing brand asset.

## 3. Approaches considered

### A. Incremental patching

Apply targeted CSS changes to the current overview, top bar, forms, dark theme and footer. This has lower initial scope but leaves the existing style layering and visual inconsistencies largely intact.

### B. Comprehensive visual-system refinement — selected

Establish one coherent set of semantic design tokens, refine the shared app shell, rebuild the overview hierarchy, standardise forms and component states, and bring every existing staff module into the same visual language. Preserve the current React structure and business workflows wherever practical.

**Decision:** Option B. It best addresses the user's request for a consistent product rather than a few isolated fixes. It does not justify a wholesale component-library replacement or a backend rewrite.

## 4. Goals

1. Make the Overview useful at a glance: clear orientation, role-aware actions, operational priorities and accurate status.
2. Make the logo, page identity, refresh action and light/dark control feel like one intentionally designed shell.
3. Replace the red-led interface accent with a restrained navy, muted-gold and teal-green visual language.
4. Improve text size, weight, contrast, spacing and line length.
5. Make forms feel deliberate, tactile, readable and comfortable on touch devices.
6. Make all existing staff modules visually consistent without inventing capabilities.
7. Give mobile content more room by removing the footer from the mobile experience and relocating its attribution to the desktop sidebar.
8. Display the crest immediately during startup and introduce a faithful outline-tracing animation.

## 5. Non-goals and hard constraints

- Do not migrate to Cloudflare or change hosting.
- Do not alter Supabase Auth, Edge Functions, database schema, RLS, API contracts, secrets, or migrations.
- Do not enable SMS, campaigns, automated messaging, offline capture, public registration, or any currently gated capability.
- Do not change the six-role model, permission checks, record scopes, or security boundaries.
- Do not insert fabricated contacts, activity, totals, trends, chart data, events, or performance metrics.
- Do not replace the logo, invent a new crest, redraw it from memory, simplify its internal elements, distort its proportions, or recolour it.
- Do not introduce purple, neon accents, excessive gradients, glassmorphism, decorative charts, or motion that delays access to the workspace.
- Do not remove existing functions or hide available functionality merely to make the interface look simpler.

## 6. Visual system

### 6.1 Direction

Use a calm, confident, modern ministry-operations aesthetic. The interface should feel precise and considered rather than ornamental. Use a clear content-first hierarchy, quiet navigation, strong type, restrained surfaces, purposeful icons and consistent interaction states.

References are for principles, not imitation:

- [Linear — a calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh): keep navigation and supporting UI visually quieter than the user's current task.
- [Apple Human Interface Guidelines — Typography](https://developer.apple.com/design/human-interface-guidelines/typography): establish a legible type hierarchy, avoid overly light weights and adapt layouts when text scales.
- [Apple Human Interface Guidelines — Color](https://developer.apple.com/design/human-interface-guidelines/color): use colour consistently to communicate brand, status and interaction.
- [Material 3 — theming and color roles](https://developer.android.com/codelabs/m3-design-theming): map primary, secondary, neutral and semantic colours to consistent roles rather than scattering raw colours.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): use measurable contrast, keyboard visibility and non-colour-only status communication.

### 6.2 Semantic palette proposal

Use semantic CSS variables rather than isolated hard-coded colours. These are starting tokens; contrast must be measured against the actual rendered combinations before release.

| Role | Light theme | Dark theme |
|---|---|---|
| App canvas | `#F3F6F8` | `#101820` |
| Main surface | `#FFFFFF` | `#18232E` |
| Raised / subtle surface | `#F7F9FB` | `#202D38` |
| Primary text | `#172B3D` | `#EEF3F7` |
| Secondary text | `#4A5B6D` | `#C0CBD5` |
| Muted text | `#647488` | `#A1AFBD` |
| Border | `#D8E0E8` | `#34424F` |
| Primary action | `#173B5E` | `#AFC5D8` |
| Primary soft surface | `#E8F0F6` | `#25394B` |
| Brand accent | `#B69A5C` | `#C7B06D` |
| Accent soft surface | `#F4EEDC` | `#322F25` |
| Positive / success | `#23785E` | `#65B894` |
| Warning | `#8C5A12` | `#E4B86A` |
| Error / destructive | `#A73342` | `#E48A94` |

Usage rules:

- Navy is the primary brand/action colour in light mode. Dark mode uses a light, restrained blue-grey action treatment with sufficient contrast against dark surfaces.
- Muted gold is a supporting brand accent for small highlights, selected details and subtle emphasis. It is not the default text colour on white.
- Teal-green indicates positive progress, completion and success.
- Red is reserved for errors, destructive actions and genuinely urgent conditions. It must not dominate selected navigation, normal buttons or routine interface decoration.
- The crest retains its original navy, red, green and white artwork; application theme tokens never recolour the crest.
- Never rely on colour alone to communicate status; pair colour with text, icons or shape.
- Validate normal text at 4.5:1 or better and large text / meaningful graphical boundaries at the applicable WCAG 2.2 thresholds. Check both themes and all hover, focus, disabled and selected states.

### 6.3 Typography and density

- Keep DM Sans as the primary application typeface. Use Fraunces sparingly and only where the existing brand treatment benefits from it; do not use it for dense data or form controls.
- Increase the current small metadata and helper text to readable sizes. Target 14–16 px for standard body and form text, 12–13 px for secondary metadata, and avoid routine 8–10 px labels.
- Use a restrained type scale with clear page title, section title, card title, body, helper and metadata roles.
- Prefer Regular, Medium, Semibold and Bold weights. Avoid hairline or very light interface text.
- Use consistent line-height and spacing; do not use letter-spaced uppercase text as the only way to label a field or section.

## 7. Application shell

### 7.1 Desktop

- Keep a stable sidebar with the existing crest and product name at the top, grouped role-authorized navigation, and the signed-in identity at the bottom.
- Reduce sidebar prominence so the active workspace is the visual focus.
- Keep the page title and contextual label on the left of the top bar.
- Group refresh and theme controls together on the right using identical touch/visual dimensions, accessible labels, visible focus and balanced spacing. Refresh must retain its current async/disabled/spinning behaviour.
- Use one consistent icon weight, stroke size, button height and corner-radius system.
- Relocate the footer attribution to a small desktop-only line at the bottom of the sidebar, below the user/account area. Remove the separate footer from the main content column.

### 7.2 Mobile

- Keep a compact brand/page identity on the left of the top bar and align refresh and theme actions as a compact control group on the right.
- Prevent title, logo and control collisions at 320 px widths and at text zoom.
- Retain the current permission-aware bottom navigation and More menu. Keep touch targets at least 44 × 44 CSS px where practical.
- Remove the footer entirely from the mobile viewport; do not replace it with a second fixed bar.
- Account for bottom navigation and device safe-area insets in scrollable content and dialogs.
- Use the mobile drawer for secondary navigation rather than forcing every destination into the bottom bar.

## 8. Overview reconstruction

Replace the current tutorial-and-permissions-heavy composition with a role-aware operational home.

### 8.1 First viewport hierarchy

1. A compact greeting and page context identifying the signed-in staff member and active workspace.
2. A small number of useful quick actions, rendered only when the current capability grants permit them (for example, Add contact and Create follow-up).
3. A balanced summary row for contacts and follow-up tasks.
4. A clear priority section for overdue and upcoming follow-up work, ordered by due time and limited to records actually available to the client.
5. A compact secondary area for recent or useful workspace information only where data is already available and permitted.

### 8.2 Data integrity rules

- The current lists are paginated at 50 records. Label values as currently loaded / in this view; never call them branch-wide totals unless the API explicitly supplies aggregates.
- Do not create trends or charts from a single limited client page.
- When more records exist, state that the preview is partial and provide a clear path to the full module.
- Do not expose contact identity details beyond the server-provided projection and current permissions.
- Render actions only when the corresponding capability is present. An inaccessible action must not be exposed as a false promise.
- Use honest loading, empty, error and success states. Do not make an empty state resemble a failure.
- Move detailed module availability and restrictions into a compact, collapsed “Workspace access” area, not the visual centre of the overview.
- Show onboarding guidance only when it helps a genuinely new/empty workspace; do not keep a three-step tutorial permanently occupying prime dashboard space for established staff.

### 8.3 Responsive composition

- Desktop: a clear primary column for the task queue and a narrower supporting column for summary/help content, with a consistent grid and aligned card edges.
- Tablet: collapse columns before any card becomes too narrow.
- Mobile: one column, prioritised by task urgency; no hidden overflow or tiny multi-column cards.

## 9. Forms and data entry

Standardise contact, task, staff, access-request, operations, team and report forms through shared visual conventions:

- Labels sit above controls and remain visible while typing. Placeholders are examples, not substitutes for labels.
- Use consistent 14–16 px input text, comfortable vertical padding, clear borders and consistent 10–12 px radii.
- Use a minimum control height of 44 px, preferably 46–48 px for primary data-entry fields.
- Show required/optional state clearly and provide concise helper text for non-obvious formats or sensitive-data restrictions.
- Use visible focus rings, distinct invalid/disabled/read-only states, and errors adjacent to the relevant field.
- Keep validation messages specific and preserve entered values after recoverable errors.
- Arrange forms in two columns only where there is sufficient width; stack logically on mobile.
- Use clear section grouping for long forms, with optional sections collapsed only where the user can understand what is hidden.
- Improve select, date/time, textarea, checkbox, search and dialog styles, not only text inputs.
- Maintain existing API payloads, validation limits, request IDs, submission semantics and confirmation steps.

## 10. Exact crest tracing and immediate loading

### 10.1 Source-of-truth rule

The existing `web/public/logo.svg` and `logo-horizontal.svg` are source assets and must remain unchanged. The logo is a raster image embedded inside an SVG wrapper. The visible source artwork—not a prompt, recollection, or generated approximation—is the sole tracing reference.

The tracing must preserve:

- the exact outer shield silhouette and both border lines;
- the original diagonal white elements and their angles;
- the central red cross, its exact negative space and alignment;
- the palm tree shape, trunk and canopy;
- the curved motto ribbon, ribbon edges and all visible lettering;
- original relative placement, proportions, whitespace, colour regions and orientation.

Do not use generative image editing for the crest. Do not add a new symbol or decorative element.

### 10.2 Proposed implementation

1. Extract the embedded source raster deterministically from the existing asset.
2. Generate contour paths from the actual image regions. Trace the outer silhouette, internal boundaries, palm tree, ribbon and lettering rather than drawing a generic perimeter only.
3. Preserve the original source image as an underlay/final reveal. The path animation is a tracing treatment over the original identity, not a replacement artwork.
4. Compare the traced paths against the source at the same 600 × 680 view box. Correct scale, alignment, path ordering and visible contour gaps. Reject an output that alters the shield, lettering or palm tree.
5. Build a small inline React/SVG loader so the tracing mark is present in the first render and does not wait for an external logo request before showing anything.
6. Draw the main outline first, then internal emblem detail and banner lettering, followed by a restrained reveal of the existing full-colour source image.
7. Respect `prefers-reduced-motion`; use a static exact-logo state for users requesting reduced motion.
8. Tie loader visibility to the existing authentication/workspace initialization state. Never add a minimum delay or wait for the full animation before granting access to a ready workspace.

Normal sidebar and mobile branding continue to use the existing original logo assets. The tracing loader is a separate presentation component.

### 10.3 Fidelity acceptance

The loaded final crest must be a single-colour outline of the exact existing crest, with no fills and no multicolour/full-colour reveal. All main external and internal contours—including the palm tree and motto lettering—must be drawn progressively by the trace itself and remain visible at completion. It must be recognisably and geometrically the same existing crest, with no rebranding, simplification or reinterpretation. If an automated trace cannot preserve a fine feature, refine that contour from the source; do not silently omit the feature or substitute an approximation.

## 11. Existing modules and consistency pass

Apply the shared design language to:

- Contacts and contact detail / interaction dialogs;
- Follow-up task lists and task creation;
- Events, Calendar, Announcements and Visitor Content workspaces;
- Teams & Areas;
- Ministry Reports;
- Staff accounts and Access requests;
- Sign-in, password change and recovery screens;
- Loading, skeleton, empty, error, success and confirmation states.

This is a visual and usability pass. Existing role/capability gates and feature availability remain authoritative. Do not imply that draft-only, unavailable or restricted features are live.

## 12. Quality, accessibility and verification

Implementation should follow test-first practice for behaviour changes and retain existing tests.

Required verification from `web/`:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

Also verify:

- light and dark theme contrast and component states;
- layout at 320 px, 375 px, tablet and desktop widths;
- keyboard focus, visible labels, semantic headings and screen-reader names;
- reduced motion and loader readiness behaviour;
- overview actions against capability grants;
- data labels that correctly disclose pagination and loaded-record limitations;
- all forms' focus, error, disabled, loading and confirmation states;
- no accidental change to API requests, auth flow, permission logic, feature gates or source logo assets.

A successful TypeScript build alone is not sufficient to claim production readiness. CI and preview verification are required before merging.

## 13. Delivery

Implement on a new feature branch based on `main`, isolated from the unrelated Cloudflare migration branches. Keep commits reviewable and focused. Open a pull request to `main` with the UI scope, test evidence, screenshots at mobile and desktop sizes, and explicit confirmation that backend integrations and the original logo files were not changed.

No production deployment or merge should be made until the pull request review and CI evidence are satisfactory.
