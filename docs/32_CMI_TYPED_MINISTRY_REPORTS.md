# Typed Ministry Reports — API and Workflow Contract

**Status:** Source-controlled draft implementation in PR #45; not deployed.  
**Policy baseline:** D-12 in `docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md`.

## Data model

The report domain stores three report types:

- `daily_evangelism`: one calendar day.
- `event_evangelism`: one calendar day and a required event reference.
- `weekly_ministry`: exactly seven consecutive calendar days.

The schema stores typed, non-negative integer counts only: contacts captured, gospel presentations, decisions for Christ, follow-ups required/completed, visits completed, calls completed, events supported and attendance count. It rejects decisions greater than presentations and completed follow-ups greater than required. Team and event references must belong to the same branch. No arbitrary JSON or narrative field is accepted.

## Trusted API

Base URL: `{SUPABASE_URL}/functions/v1/report-operations`

All routes require a valid Supabase Auth bearer token and an active staff profile that has completed first-login password setup. The function resolves the staff profile, role assignments, capability grants, branch scope and team memberships from server-side records. Caller-supplied actor IDs, author IDs, reviewer IDs, role names, capability claims and lifecycle status are rejected or ignored.

| Route | Purpose |
|---|---|
| `GET /reports?branch_id={uuid}&limit={n}&offset={n}` | Read own reports, active own-team reports, or branch reports according to grants. |
| `GET /reports/{reportId}?branch_id={uuid}` | Read one report only when own/team/branch scope passes. Includes append-only review history. |
| `POST /reports` | Create and submit a typed report. Author identity and submitted status are server-derived. |
| `POST /reports/{reportId}/review` | Approve, return or comment on a submitted report. Self-review is forbidden. |
| `POST /reports/{reportId}/resubmit` | Author-only correction of a returned report; the new submission and count updates commit atomically. |
| `GET /teams?branch_id={uuid}` | Minimal active team options for teams the caller currently belongs to. |
| `GET /events?branch_id={uuid}` | Minimal event options limited to events actively assigned to the caller. |

List limits are 1–50 and offset is 0–5000, using database-side exact counts and pagination. Duplicate submissions for the same author, report type, period and team/event scope are rejected with HTTP 409. Counts must be whole numbers from 0–100000. Report exports are not implemented. Browser roles have no direct table access.

## Role matrix

| Role | Report access |
|---|---|
| Admin/Pastor | Branch-wide review |
| Coordinator | Branch-wide review |
| Team Leader | Submit/read own reports; review submitted reports for active own teams |
| Field Worker | Submit/read own reports |
| Follow-up Volunteer | Submit/read own reports |
| Prayer Intercessor | No report access |

The API enforces these permissions on every request. UI navigation is only a convenience and is not an authorization boundary.

## Review integrity

Review decisions and author resubmissions are appended to `report_review_event` with an `actor_profile_id` and a typed decision (`approved`, `returned`, `comment` or `resubmitted`). Updates, deletes and truncation are rejected. The service-role-only `cmi_review_ministry_report` database transaction locks the report, revalidates the reviewer's active staff profile, role assignment, capability grant and (for Team Leaders) current team membership, rejects self-review and non-submitted reports, changes status when approving/returning, and inserts the review event in the same transaction. This closes the time-of-check/time-of-use gap between the Edge Function's scope lookup and the write. The service-role-only `cmi_resubmit_ministry_report` transaction similarly revalidates the author's active profile and `report.submit.own` grant before allowing correction of a returned report. A failed review or resubmission cannot partially change the report or history. The workspace exposes the append-only review history, including author resubmissions, to users who can read the report.

## Release and verification boundaries

- This migration is not applied to the hosted Supabase project.
- The Edge Function is source-controlled only; it is not deployed.
- The frontend workspace is source-controlled only; it is not deployed.
- CI must pass Deno formatting/lint/type checks, clean local migration replay, pgTAP and frontend build/tests.
- Authenticated browser acceptance must verify every role, branch isolation, team isolation, report submission and review lifecycle.
- Report exports remain disabled.
- No real congregant data should be loaded until the project privacy, UAT, restore and monitoring release gates are met.
