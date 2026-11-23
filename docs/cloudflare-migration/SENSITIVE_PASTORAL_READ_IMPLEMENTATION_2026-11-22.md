# Sensitive pastoral read Worker migration — 2026-11-22

## Routes

| Method | Route | Purpose |
|---|---|---|
| POST | \`/api/v1/pastoral/prayer/requests/:id/read\` | Read one prayer request using assigned or oversight access |
| POST | \`/api/v1/pastoral/care/records/:id/read\` | Read one pastoral-care record and its restricted interactions |

Both routes require a verified Supabase access token, an active staff profile, and a matching active branch. The request body accepts only \`branch_id\`, \`access_mode\`, and (for oversight) \`reason_code\`.

## Authorization

- Assigned prayer reads require \`prayer.request.read.assigned\` with \`assigned\` scope and a live, non-revoked \`prayer_assignment\` for the caller.
- Prayer oversight reads require \`prayer.oversight.read\` with \`oversight\` scope and one of the allowlisted reason codes.
- Care oversight reads require \`care.oversight.read\` with \`oversight\` scope and one of the same allowlisted reason codes.
- The Worker also implements the assigned-care predicate, but the current D1 capability catalogue grants no role \`care.record.read.assigned\`. It therefore remains denied until an owner-approved role grant exists; no new role grant was introduced.

Allowlisted oversight reason codes:
- \`pastoral_review\`
- \`continuity_of_care\`
- \`safeguarding_concern\`
- \`complaint_review\`
- \`administrative_review\`

Assigned reads reject an oversight reason. Oversight reads reject a missing or unsupported reason. Cross-branch record IDs do not return narrative data.

## Audit-before-disclosure behavior

The Worker batches the domain audit, the metadata-only sensitive-access audit, and the record projection in one D1 batch. It returns narrative data only when both audit inserts succeed exactly once and the scoped record query returns a row.

- Prayer reads write \`prayer_access_audit\` and \`sensitive_record_access_audit\`.
- Care reads write \`care_access_audit\` and \`sensitive_record_access_audit\`.
- Audit purpose stores only the access mode and reason code; it does not store the narrative.
- Care projections include only record status/timestamps and the latest 100 interaction entries. They do not expose contact identity fields.
- Both audit tables are protected by append-only triggers in the D1 schema.

## Verification

Synthetic Worker tests cover assigned prayer access, oversight prayer access, denial without a live assignment, care oversight access, reason-code validation, and audit writes before response. Frontend tests verify both methods route through the Worker with the required access mode and reason fields.

Worker source commit: \`c35179e41ee7f17b6e7ee784da45b18402a9ad51\`.

Preview Worker version \`51ad049f-c48d-4cc9-8718-910c39ea0393\` receives 100% preview traffic. Existing non-production D1, Supabase Auth, and secret bindings were preserved. Production routing/data and SMS were not changed.
