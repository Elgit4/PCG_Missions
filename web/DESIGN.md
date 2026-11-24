# PCG Missions Staff PWA — UI Design Contract

**Baseline:** CMI Follow-up v2.1  
**Last updated:** 12 November 2026  
**Audience:** Frontend engineers, reviewers and QA

## Product character

PCG Missions is a professional church-ministry operations tool used in offices, services and field follow-up. The interface should feel calm, trustworthy and quick to operate on a phone. It must prioritise legibility and predictable actions over decorative effects.

## Visual direction

- Use the established midnight navy, slate and neutral surfaces, with crimson reserved for destructive or urgent states.
- Keep the existing font stack and scale. Headings are compact and informative; labels are small but not faint; body copy remains readable at normal zoom.
- Avoid purple, excessive gradients, glass panels, blurred backgrounds, oversized hero text and generic dashboard decoration.
- Use borders and subtle surface changes to establish hierarchy. Use elevation only for true overlays and dialogs.
- Use Lucide icons only when they help identify an action or status. Do not use emoji as module icons.
- Keep the existing PCG Missions identity and ElTech footer attribution. Do not duplicate logos.

## Layout

- Desktop: fixed navigation rail, compact page header, constrained content width and responsive data table.
- Tablet: preserve clear navigation and allow data tables to scroll within their own container.
- Mobile: touch-friendly navigation, full-width actions, stacked forms and bottom-sheet-style detail dialogs.
- Detail dialogs must stay within the viewport; only the detail body scrolls, never the whole page behind the overlay.
- Avoid horizontal overflow. Wide operational tables may scroll within their own labelled region.

## Components

- Buttons: one clear primary action per panel; secondary and destructive actions remain visually distinct.
- Forms: visible labels, explicit required/optional text, useful placeholders, clear validation and no hidden required fields.
- Tables: meaningful captions, semantic column headers and empty states. Contact names act as explicit buttons to open a record.
- Status: show concise text as well as color. Overdue is a visible operational state, not only a colored dot.
- Dialogs: use Radix Dialog for focus management, Escape close, labelled title/description and focus restoration.
- Notifications: distinguish server-confirmed success from pending/loading. Keep errors actionable and preserve request references when available.

## Accessibility

- All actions must be keyboard reachable and have visible focus.
- Inputs need programmatic labels. Icon-only controls need accessible names.
- Preserve readable contrast and respect reduced-motion preferences.
- Do not communicate access restrictions by color alone.
- Ensure touch targets are comfortable on narrow screens.

## Responsive verification sizes

At minimum review:
- 360 × 800: narrow mobile portrait;
- 390 × 844: common mobile portrait;
- 768 × 1024: tablet;
- 1280 × 800: desktop;
- 1440 × 900: wide desktop.

Check the navigation, contacts table, add-contact form, contact detail dialog, follow-up filters, task row actions and alert banners at all relevant widths.

## Product constraints

- The frontend is not an authorization boundary. It only reflects capabilities returned by the server.
- Never display a module as operational merely because a database table, function stub or API contract exists.
- Prayer/care, public event registration, attendance, reports, publishing, SMS dispatch, exports and offline sync remain gated until the documented backend, policy and release criteria pass.
