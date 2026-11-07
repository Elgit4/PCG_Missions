# CMI Follow-up — Logical ERD to Physical Schema Traceability

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Design crosswalk for review; not executable SQL  
**Source artifacts:** [Logical Data Model](06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md), [Crow's Foot ERD](database/CMI_Follow_Up_Logical_ERD_v0.1.drawio), [Physical Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md), [Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md)

## 1. Purpose

This crosswalk maps every entity represented on the seven-page logical ERD to its proposed PostgreSQL table or tables. It prevents entities from disappearing or being renamed inconsistently when the logical design is translated into a physical schema.

The ERD contains 53 named entity boxes across seven pages. The mapping below records deliberate physical decomposition/renaming and the areas requiring approval or detailed field-level reconciliation.

## 2. Entity crosswalk

| ERD entity | Logical model entity | Proposed physical table(s) | Mapping note |
|---|---|---|---|
| CHURCH_BRANCHES | church/branch configuration | `church`, `branch`, `church_setting` | Separates church instance, branch context and settings. |
| STAFF_PROFILES | staff profiles | `staff_profile` | Links to Supabase Auth user UUID. |
| ROLES | roles | `role` | Six CMI roles only. |
| CAPABILITIES | capabilities | `capability` | Controlled catalogue. |
| ROLE_CAPABILITIES | role-capability grants | `role_capability_grant` | Conditional grants are not effective until approved. |
| STAFF_ROLE_ASSIGNMENTS | staff role assignments | `staff_role_assignment` | Validity and assignment audit. |
| TEAMS | teams | `team` | Branch-scoped. |
| STAFF_TEAM_MEMBERSHIPS | staff/team memberships | `team_membership` | Validity-aware history. |
| SERVICE_AREAS | service areas | `service_area` | Branch-scoped. |
| STAFF_AREA_COVERAGE | staff area coverage | `staff_area_assignment` | Validity-aware many-to-many relationship. |
| EVENT_STAFF_ASSIGNMENTS | event staff assignments | `event_team_assignment` | Team/person target semantics need final reconciliation. |
| CONTACTS | contacts | `contact` | Canonical record; phone is not a unique person key. |
| CONTACT_CAPTURES | contact captures | `contact_capture` | Capture provenance and idempotency. |
| CONTACT_NOTES | contact notes | `contact_note` | Ordinary notes only. |
| CONTACT_ASSIGNMENTS | contact assignments | `contact_assignment` | Person/team scope and validity. |
| CONTACT_INTERACTIONS | contact interactions | `contact_interaction` | Interaction/outcome history. |
| CONTACT_MERGE_HISTORY | contact merge history | `contact_merge` | Merge/reversal provenance. |
| FOLLOW_UP_LISTS | follow-up lists | `followup_list` | Scope reference requires validated type/ID relationship. |
| FOLLOW_UP_TASKS | follow-up tasks | `followup_task` | Person/team assignment semantics remain subject to D-04. |
| FOLLOW_UP_TASK_EVENTS | follow-up task events | `followup_task_event` | Append-only transition history. |
| PRAYER_REQUESTS | prayer requests | `prayer_request` | Restricted narrative domain. |
| PRAYER_ASSIGNMENTS | prayer assignments | `prayer_assignment` | Active assignment determines intercessor access. |
| PRAYER_ACCESS_EVENTS | prayer access events | `prayer_access_audit` | Sensitive reads require a mediated audited path if per-read audit is mandatory. |
| CARE_GROUPS | care groups | `care_group` | Restricted care domain. |
| CARE_GROUP_MEMBERSHIPS | care group memberships | `care_group_membership` | Added to physical inventory during traceability review. |
| CARE_RECORDS | care records | `care_record` | Restricted pastoral/care record. |
| CARE_INTERACTIONS | care interactions | `care_interaction` | Restricted notes and call/visit outcomes. |
| EVENTS | events | `event` | Event lifecycle, publication and registration state. |
| EVENT_REGISTRATIONS | event registrations | `event_registration` | Attendee snapshots and idempotent intake. |
| TRANSPORT_RESERVATIONS | transport reservations | `transport_option`, `transport_reservation` | Normalizes event transport options and reservations. |
| EVENT_ATTENDANCE | event attendance/check-in | `event_checkin` | Name snapshot supports walk-in/offline check-in. |
| EVENT_CLOSEOUTS | event closeouts | `event_closeout`, `event_closeout_event` | Current state separated from append-only history. |
| CONTACT_COMMUNICATION_PREFERENCES | communication preferences | `communication_preference` | Consent/lawful-basis evidence and withdrawal. |
| SMS_SUPPRESSIONS | SMS/channel suppressions | `communication_suppression` | Channel-aware and phone-level suppression. |
| SMS_TEMPLATES | SMS templates | `sms_template`, `sms_template_version` | Metadata plus immutable version history. |
| SMS_TEMPLATE_VERSIONS | SMS template versions | `sms_template_version` | Explicit physical version table. |
| SMS_CAMPAIGNS | SMS campaigns | `sms_campaign` | Bulk campaigns; manual individual sends are outbox rows without campaigns. |
| SMS_CAMPAIGN_RECIPIENTS | campaign recipient snapshots | `sms_campaign_recipient` | Supports contact or staff recipient identity. |
| SMS_AUTOMATION_RULES | automation rules | `sms_automation_rule` | Disabled until trigger, recipient class and controls are approved. |
| SMS_AUTOMATION_EXECUTIONS | automation executions | `sms_automation_execution` | Idempotent trigger/recipient execution. |
| SMS_OUTBOX_MESSAGES | outbox messages | `sms_outbox`, `sms_dispatch_attempt` | Message state plus retry history. |
| SMS_DELIVERY_EVENTS | delivery events | `sms_delivery_event` | Append-only, provider-event deduplication. |
| ANNOUNCEMENTS | announcements | `announcement` | Scoped publication and audience. |
| ANNOUNCEMENT_DELIVERIES | announcement deliveries | `announcement_delivery` | Per-channel delivery attempt/status. |
| CHURCH_PUBLIC_PROFILE | church public profile | `church_public_profile` | One public profile for the configured church. |
| SERMONS | sermons | `sermon` | Published content and public slug. |
| DAILY_WORDS | daily words | `daily_word` | Date-based published content. |
| WELCOME_MESSAGES | welcome messages | `welcome_message` | Added to physical inventory during validation. |
| DIGITAL_TRACTS | digital tracts | `digital_tract`, `external_document_link` | External PDF references only; no PDF hosting. |
| MINISTRY_REPORTS | ministry reports | `ministry_report` | Daily, event and weekly report types. |
| REPORT_REVIEW_EVENTS | report review events | `report_review_event` | Append-only review history. |
| AUDIT_EVENTS | audit events | `audit_event` | Append-only security/privileged-action record. |
| OFFLINE_SYNC_RECEIPTS | offline sync receipts | `offline_sync_receipt` | Idempotency receipt, not a full offline store. |

## 3. Physical support tables not represented as standalone ERD entities

- `church_setting` — typed/configured church settings.
- `event_closeout_event` — append-only closeout action history.
- `sms_inbound_event` — optional provider inbound callback/STOP receipt path.
- `sms_dispatch_attempt` — provider dispatch retry history.
- `external_document_link` — normalized external document references.
- `staff_capability_override` — individually approved, audited capability exceptions.

## 4. Reconciliation items before migrations

1. **Care-group membership:** physical inventory now includes `care_group_membership`; confirm the ERD relationship cardinalities and full attributes.
2. **Event staff assignment:** `event_team_assignment` may imply team assignment while the ERD entity is staff-centric. Decide whether the relation supports team assignment, individual staff assignment or both.
3. **Task assignment:** D-04 must settle whether a task may simultaneously target an individual and a team.
4. **SMS recipient identity:** physical campaign recipients support contact or staff identity. Add a check matching recipient class and exactly one identity; confirm allowed recipient classes.
5. **SMS campaign body:** logical model mentions `body_snapshot`; physical model prefers immutable `sms_template_version`. Confirm whether every campaign must use an approved template or campaign-specific body snapshots are allowed.
6. **Transport detail:** pickup area and notes are represented in physical reservations. Confirm whether pickup area is free text or a controlled lookup.
7. **Attendance identity:** confirm duplicate prevention when neither registration nor contact ID exists for a walk-in/offline attendee.
8. **Public registration snapshots:** approve exact attendee fields and retention before finalizing columns.
9. **Field-level access:** approve R-05/R-11 field matrix before exposing contact-linked fields.
10. **Branch consistency:** identify every parent/child pair requiring composite branch foreign keys in the final data dictionary.

## 5. Traceability acceptance criteria

- [x] All 53 entity boxes on the current seven-page ERD have a physical mapping.
- [x] Care-group membership gap found and added to physical proposal.
- [x] Visitor welcome-message gap found and added to physical proposal.
- [x] SMS campaign recipient contact/staff identity gap identified and added to physical proposal.
- [ ] All ERD attributes reconciled against physical columns.
- [ ] Every ERD relationship/cardinality reconciled against physical foreign keys and uniqueness constraints.
- [ ] All D-01–D-13 and R-01–R-12 decisions recorded.
- [ ] Stakeholder-approved ERD and physical data dictionary signed off.

## 6. Verification limitations

This crosswalk was checked against the current logical model, seven diagram pages and physical schema proposal. It is a design traceability review, not an automated XML-to-schema parser or SQL validation. No database migrations or hosted Supabase changes were made.
