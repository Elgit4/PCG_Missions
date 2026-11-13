from pathlib import Path
import re
import unittest


WORKER_SOURCE = Path(__file__).resolve().parents[1] / "src" / "index.ts"


class WorkerApiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = WORKER_SOURCE.read_text(encoding="utf-8")
        cls.event_guard_migration = (Path(__file__).resolve().parents[1] / "migrations" / "0020_event_assignment_privilege_guards.sql").read_text(encoding="utf-8")
        cls.event_operations_migration = (Path(__file__).resolve().parents[1] / "migrations" / "0018_event_operations_guards.sql").read_text(encoding="utf-8")

    def test_contact_team_scope_uses_profile_id_and_assigned_scope_uses_auth_user_id(self):
        match = re.search(
            r"function contactScopePredicate\([\s\S]*?\n\}",
            self.source,
        )
        self.assertIsNotNone(match, "contactScopePredicate must remain an explicit, testable policy helper")
        helper = match.group(0)
        self.assertRegex(helper, r"staffProfileId\s*:\s*string")
        self.assertRegex(helper, r"staffUserId\s*:\s*string")

        team_branch = helper.split('if (mode === "team")', 1)[1].split(
            'if (mode === "assigned")', 1
        )[0]
        assigned_branch = helper.split('if (mode === "assigned")', 1)[1]

        self.assertIn("values: [staffProfileId, now, now, now, now]", team_branch)
        self.assertIn("values: [staffUserId, now, now]", assigned_branch)

    def test_contact_scope_callers_pass_both_server_derived_staff_identifiers(self):
        calls = re.findall(r"contactScopePredicate\(([\s\S]*?)\)", self.source)
        self.assertGreaterEqual(len(calls), 10)
        call_sites = [call for call in calls if not re.search(r"\bmode\s*:", call)]
        self.assertGreaterEqual(len(call_sites), 10)
        for call in call_sites:
            self.assertRegex(
                call,
                r"(?:context|access)\.staff\.profileId[\s\S]*?(?:context|access)\.staff\.userId[\s\S]*?(?:context|access)\.activeBranch\.branchId",
                msg=f"Contact scope call must pass profile ID and auth user ID separately: {call}",
            )


    def test_cors_allows_idempotency_header_used_by_browser_mutations(self):
        cors = re.search(r"function authCorsHeaders\([\s\S]*?\n\}", self.source)
        self.assertIsNotNone(cors)
        self.assertRegex(cors.group(0), r"(?i)Access-Control-Allow-Headers[\s\S]*Idempotency-Key")

    def test_followup_contact_details_use_followup_task_scope_predicate(self):
        handler = re.search(r"async function listFollowupTasks\([\s\S]*?\n\}", self.source)
        self.assertIsNotNone(handler)
        self.assertIn('followupScopePredicate(detailScope, "ft"', handler.group(0))
        self.assertNotIn('contactScopePredicate(detailScope, "ft"', handler.group(0))

    def test_contact_list_never_returns_merged_records_even_with_all_status_filter(self):
        handler = re.search(r"async function listContacts\([\s\S]*?\n\}", self.source)
        self.assertIsNotNone(handler)
        self.assertIn("c.contact_status <> 'merged'", handler.group(0))

    def test_contact_interaction_history_has_a_scoped_get_route(self):
        self.assertIn("async function listContactInteractions(", self.source)
        self.assertRegex(
            self.source,
            r'if \(request\.method === "GET"\) return listContactInteractions\(request, env, contactId',
        )


    def test_json_body_reader_rejects_oversized_streams_before_full_buffering(self):
        reader = re.search(r"async function readJsonBody\([\s\S]*?\n\}", self.source)
        self.assertIsNotNone(reader)
        self.assertIn("Content-Length", reader.group(0))
        self.assertIn("getReader()", reader.group(0))
        self.assertIn("reader.cancel(", reader.group(0))
        self.assertNotIn("await request.text()", reader.group(0))


    def test_event_draft_and_read_routes_are_present_and_scoped(self):
        for name in ("eventScopePredicate", "listEvents", "getEvent", "createEvent", "updateEvent", "publishEvent", "cancelEvent"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('url.pathname === "/api/v1/events"', self.source)
        self.assertIn("event_staff_assignment", self.source)
        self.assertIn("event_team_assignment", self.source)

    def test_event_creation_is_server_defaulted_to_private_draft_with_registration_closed(self):
        handler = re.search(r"async function createEvent\([\s\S]*?\n\}", self.source)
        self.assertIsNotNone(handler)
        code = handler.group(0)
        self.assertIn("'draft'", code)
        self.assertIn("'private'", code)
        self.assertIn("'closed'", code)
        self.assertIn("access.staff.userId", code)
        self.assertNotIn("payload.status", code)
        self.assertNotIn("payload.visibility", code)
        self.assertNotIn("payload.registration_state", code)


    def test_calendar_routes_use_branch_team_and_assigned_scope_predicates(self):
        for name in ("calendarScopePredicate", "listCalendarEntries", "createCalendarEntry", "updateCalendarEntry"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('url.pathname === "/api/v1/calendar"', self.source)
        self.assertIn('"calendar.manage"', self.source)
        self.assertIn('"calendar.read"', self.source)

    def test_announcement_routes_are_capability_gated_and_audience_scoped(self):
        for name in ("announcementScopePredicate", "listAnnouncements", "createAnnouncement", "updateAnnouncement", "publishAnnouncement", "archiveAnnouncement"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('url.pathname === "/api/v1/announcements"', self.source)
        self.assertIn("announcement_team_audience", self.source)
        self.assertIn("announcement_event_audience", self.source)

    def test_public_content_projection_only_selects_published_records(self):
        handler = re.search(r"async function getPublicContent\([\s\S]*?\n\}", self.source)
        self.assertIsNotNone(handler)
        code = handler.group(0)
        self.assertRegex(code, r"status\s*=\s*'published'")
        self.assertRegex(code, r"is_public\s*=\s*1")
        self.assertIn("branch_id", code)


    def test_public_content_management_has_capability_gated_draft_and_profile_routes(self):
        for name in ("contentKindConfig", "listContent", "createContent", "updateContent", "publishContent", "archiveContent", "getContentProfile", "updateContentProfile", "createExternalDocumentLink"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('"content.manage"', self.source)
        self.assertIn('"content.read"', self.source)
        self.assertIn('url.pathname === "/api/v1/content"', self.source)
        self.assertIn('url.pathname === "/api/v1/content/profile"', self.source)
        self.assertIn("public_content_change_audit", self.source)


    def test_event_audit_read_is_branch_manager_only(self):
        self.assertIn("function listEventAudit(", self.source)
        self.assertIn('authorizeRequestCapability(request, env, "events.manage")', self.source)
        self.assertIn("event_change_audit", self.source)
        self.assertIn('url.pathname.match(/^\/api\/v1\/events\/([^/]+)\/audit$/)', self.source)


    def test_event_registration_routes_require_idempotency_and_capacity(self):
        for name in ("eventRequestDigest", "findEventReceipt", "setEventRegistrationState", "listEventRegistrations", "createEventRegistration", "cancelEventRegistration"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('request.headers.get("Idempotency-Key")', self.source)
        self.assertIn("event_idempotency_receipt", self.source)
        self.assertIn("EVENT_CAPACITY_REACHED", self.source)
        self.assertIn("registration_state='open'", self.event_operations_migration)

    def test_event_checkin_and_transport_routes_are_idempotent_and_scoped(self):
        for name in ("hasEventAssignmentRole", "hasEventCheckinAccess", "createEventCheckin", "listEventCheckins", "listTransportOptions", "createTransportOption", "updateTransportOption", "listTransportReservations", "createTransportReservation", "cancelTransportReservation"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('"event_checkin"', self.source)
        self.assertIn('"transport_reservation"', self.source)
        self.assertIn("TRANSPORT_CAPACITY_REACHED", self.source)
        self.assertIn("transport_reservation_capacity_guard", self.event_operations_migration)

    def test_closeout_submission_review_and_resubmission_are_audited(self):
        for name in ("eventCloseoutCounts", "getEventCloseout", "submitEventCloseout", "resubmitEventCloseout", "reviewEventCloseout"):
            self.assertIn(f"function {name}(", self.source)
        self.assertIn('"events.closeout.review"', self.source)
        self.assertIn("event_closeout_event", self.source)
        self.assertIn('"closeout_submit"', self.source)
        self.assertIn('"closeout_review"', self.source)


    def test_event_cancellation_persists_the_idempotency_key_and_replays_races(self):
        for name in ("cancelEventRegistration", "cancelTransportReservation"):
            handler = re.search(rf"async function {name}\([\s\S]*?\n\}}", self.source)
            self.assertIsNotNone(handler)
            self.assertIn("cancellation_request_key=?", handler.group(0))
            self.assertIn("findEventReceipt", handler.group(0))
        self.assertIn("cancellation_request_key", self.source)
        self.assertIn("EVENT_CANCELLATION_IDEMPOTENCY_CONFLICT", self.source)

    def test_event_assignment_roles_are_restricted_for_registration_and_checkin(self):
        self.assertIn("'owner','organizer'", self.event_guard_migration)
        self.assertIn("'checkin'", self.event_guard_migration)
        self.assertIn("'ushering'", self.event_guard_migration)
        self.assertIn("event_registration_authorize_insert", self.event_guard_migration)


    def test_event_operations_use_event_assignment_roles_not_only_branch_manager_grants(self):
        self.assertIn("async function hasEventAssignmentRole(", self.source)
        for name in ("listEventRegistrations", "createEventRegistration", "cancelEventRegistration",
                     "listTransportOptions", "createTransportOption", "updateTransportOption",
                     "listTransportReservations", "createTransportReservation", "cancelTransportReservation"):
            handler = re.search(rf"async function {name}\([\s\S]*?\n\}}", self.source)
            self.assertIsNotNone(handler, name)
            self.assertIn("hasEventAssignmentRole", handler.group(0), name)
        for name in ("createEventCheckin", "listEventCheckins"):
            handler = re.search(rf"async function {name}\([\s\S]*?\n\}}", self.source)
            self.assertIsNotNone(handler, name)
            self.assertIn("hasEventCheckinAccess", handler.group(0), name)

if __name__ == "__main__":
    unittest.main()
