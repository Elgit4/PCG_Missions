# PCG Missions theme toggle

## Intent
Give staff a deliberate light/dark appearance control across the authenticated workspace and sign-in/recovery screens, while preserving the current light design as the default for users without a saved preference.

## Goals
- Add an accessible, compact toggle in the desktop workspace header and the authentication screen.
- Persist an explicit user choice across reloads using local storage.
- Follow the operating-system preference only when the user has not selected a theme.
- Apply the theme at the document root so every module and shared overlay inherits it.

## Non-goals
- No per-branch or per-account database setting.
- No changes to authentication, authorization, data, or release gates.
- No redesign of the existing light palette.

## Approaches
- Root-level theme provider and CSS tokens: one state source, consistent across every route and overlay; recommended.
- Independent component-level toggles: duplicates state and risks inconsistent modules; rejected.
- OS-only automatic theme: does not give users a manual choice; rejected.

## Decision
Use a small React theme provider at the application root, localStorage persistence, system preference as the initial fallback, and a semantic button with changing accessible label. Keep the existing light appearance as the fallback when system preference is unavailable. Add dark-mode token and component overrides in the existing UI refresh stylesheet.
