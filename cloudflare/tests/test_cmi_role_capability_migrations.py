import re
import sqlite3
import unittest
from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


class CmiRoleCapabilityMigrationTests(unittest.TestCase):
    """Replay the complete D1 chain and assert the owner-approved six-role grants."""

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        for migration in sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql")):
            try:
                self.db.executescript(migration.read_text(encoding="utf-8"))
            except sqlite3.Error as error:
                diagnostics = {
                    "schema": self.db.execute("SELECT schema_version, environment FROM app_meta").fetchone(),
                    "roles": self.db.execute("SELECT COUNT(*) FROM role").fetchone()[0],
                    "grants": self.db.execute("SELECT COUNT(*) FROM role_capability").fetchone()[0],
                    "capabilities": self.db.execute("SELECT COUNT(*) FROM capability").fetchone()[0],
                    "active_capabilities": self.db.execute("SELECT COUNT(*) FROM capability WHERE is_active = 1").fetchone()[0],
                }
                raise AssertionError(f"Migration {migration.name} failed: {error}; state={diagnostics}") from error

    def tearDown(self):
        self.db.close()

    def role_codes(self):
        return {
            row[0] for row in self.db.execute(
                "SELECT code FROM role WHERE is_active = 1"
            )
        }

    def grants(self, role_code):
        return {
            (row[0], row[1]) for row in self.db.execute(
                """
                SELECT c.code, rc.scope_mode
                FROM role_capability rc
                JOIN role r ON r.id = rc.role_id
                JOIN capability c ON c.id = rc.capability_id
                WHERE r.code = ? AND r.is_active = 1 AND c.is_active = 1
                """,
                (role_code,),
            )
        }

    def test_full_migration_chain_reaches_schema_47(self):
        self.assertEqual(
            self.db.execute(
                "SELECT schema_version, environment FROM app_meta WHERE id = 1"
            ).fetchone(),
            (47, "non-production"),
        )
        self.assertEqual(
            self.role_codes(),
            {
                "admin_pastor",
                "coordinator",
                "team_leader",
                "field_worker",
                "follow_up_volunteer",
                "prayer_intercessor",
            },
        )


    def test_branch_admin_can_deactivate_audited_staff_profile_without_active_role(self):
        now = "2026-11-23T12:00:00.000Z"
        church_id = "orphan-deactivation-church"
        branch_id = "orphan-deactivation-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Deactivation Test Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (branch_id, church_id, "Deactivation Test Branch", "Africa/Accra", now, now),
        )
        self.db.execute(
            'INSERT INTO "user"(id,name,email,emailVerified,image,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
            ("orphan-admin-user", "Admin", "orphan-admin@example.test", 1, None, 1, 1),
        )
        self.db.execute(
            'INSERT INTO "user"(id,name,email,emailVerified,image,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
            ("orphan-target-user", "Test Member", "orphan-target@example.test", 1, None, 1, 1),
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id,auth_user_id,full_name,email,account_status,created_at,updated_at,must_change_password)
               VALUES('orphan-admin-profile','orphan-admin-user','Admin','orphan-admin@example.test','active',?,?,0)""",
            (now, now),
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id,auth_user_id,full_name,email,account_status,created_at,updated_at,must_change_password)
               VALUES('orphan-target-profile','orphan-target-user','Test Member','orphan-target@example.test','active',?,?,1)""",
            (now, now),
        )
        admin_role_id = self.db.execute(
            "SELECT id FROM role WHERE code='admin_pastor'"
        ).fetchone()[0]
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES('orphan-admin-assignment','orphan-admin-profile',?,?,'orphan-admin-profile',?,?)""",
            (admin_role_id, branch_id, now, now),
        )
        # The target has a verified branch history but no current assignment.
        self.db.execute(
            """INSERT INTO staff_access_audit
               (id,branch_id,actor_profile_id,target_profile_id,action,reason,metadata,created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            ("orphan-target-history", branch_id, "orphan-admin-profile",
             "orphan-target-profile", "account_created", "Created for controlled onboarding test",
             "{}", now),
        )
        self.db.execute(
            """INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId)
               VALUES('orphan-target-session',9999999999,'orphan-target-session-token',1,1,'orphan-target-user')"""
        )
        self.db.execute(
            """UPDATE staff_profile
               SET account_status='inactive',deactivated_at=?,
                   account_status_changed_by='orphan-admin-profile',
                   account_status_changed_branch_id=?,
                   account_status_reason='Owner-directed removal of test login',
                   updated_at=?
               WHERE id='orphan-target-profile'""",
            (now, branch_id, now),
        )
        self.assertEqual(
            self.db.execute("SELECT account_status FROM staff_profile WHERE id='orphan-target-profile'").fetchone()[0],
            "inactive",
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM session WHERE userId='orphan-target-user'").fetchone()[0],
            0,
        )
        self.assertEqual(
            self.db.execute("""SELECT COUNT(*) FROM staff_account_audit
                               WHERE target_profile_id='orphan-target-profile' AND action='account_deactivated'""").fetchone()[0],
            1,
        )
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_contact_assignment_can_be_ended_early_for_team_handoff(self):
        now = "2026-11-23T12:00:00.000Z"
        transition_at = "2026-11-23T12:00:01.000Z"
        future_end = "2026-11-26T12:00:00.000Z"
        church_id = "handoff-church"
        branch_id = "handoff-branch"
        admin_user_id = "handoff-admin-user"
        worker_user_id = "handoff-worker-user"
        admin_profile_id = "handoff-admin-profile"
        worker_profile_id = "handoff-worker-profile"
        contact_id = "handoff-contact"
        assignment_id = "handoff-existing-assignment"
        team_id = "handoff-team"

        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Handoff Test Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (branch_id, church_id, "Handoff Test Branch", "Africa/Accra", now, now),
        )
        for user_id, name, email in (
            (admin_user_id, "Admin", "handoff-admin@example.test"),
            (worker_user_id, "Field Worker", "handoff-worker@example.test"),
        ):
            self.db.execute(
                'INSERT INTO "user"(id,name,email,emailVerified,image,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
                (user_id, name, email, 1, None, 1, 1),
            )
        for profile_id, user_id, name, email in (
            (admin_profile_id, admin_user_id, "Admin", "handoff-admin@example.test"),
            (worker_profile_id, worker_user_id, "Field Worker", "handoff-worker@example.test"),
        ):
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,email,account_status,created_at,updated_at,must_change_password)
                   VALUES(?,?,?,?, 'active',?,?,0)""",
                (profile_id, user_id, name, email, now, now),
            )
        admin_role_id = self.db.execute(
            "SELECT id FROM role WHERE code='admin_pastor'"
        ).fetchone()[0]
        worker_role_id = self.db.execute(
            "SELECT id FROM role WHERE code='field_worker'"
        ).fetchone()[0]
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES('handoff-admin-role',?,?,?, ?,?,?)""",
            (admin_profile_id, admin_role_id, branch_id, admin_profile_id, now, now),
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES('handoff-worker-role',?,?,?, ?,?,?)""",
            (worker_profile_id, worker_role_id, branch_id, admin_profile_id, now, now),
        )
        self.db.execute(
            "INSERT INTO team(id,branch_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
            (team_id, branch_id, "Follow-up Team", now, now),
        )
        self.db.execute(
            """INSERT INTO contact(id,branch_id,first_name,last_name,created_at,updated_at)
               VALUES(?,?,?,?,?,?)""",
            (contact_id, branch_id, "Handoff", "Contact", now, now),
        )
        self.db.execute(
            """INSERT INTO contact_assignment
               (id,contact_id,branch_id,assignee_user_id,team_id,assigned_by,starts_at,ends_at,reason,created_at)
               VALUES(?,?,?,?,NULL,?,?,?,?,?)""",
            (assignment_id, contact_id, branch_id, worker_user_id, admin_user_id,
             now, future_end, "Initial field-worker assignment", now),
        )

        self.db.execute(
            """UPDATE contact_assignment
               SET ends_at=?,ended_by=?,reason=?
               WHERE id=?""",
            (transition_at, admin_user_id, "Early handoff to the ministry team", assignment_id),
        )
        ended = self.db.execute(
            "SELECT ends_at,ended_by,reason FROM contact_assignment WHERE id=?",
            (assignment_id,),
        ).fetchone()
        self.assertEqual(ended, (transition_at, admin_user_id, "Early handoff to the ministry team"))
        self.assertEqual(
            self.db.execute(
                "SELECT action FROM contact_assignment_audit WHERE assignment_id=? ORDER BY created_at DESC LIMIT 1",
                (assignment_id,),
            ).fetchone()[0],
            "ended_early",
        )

        self.db.execute(
            """INSERT INTO contact_assignment
               (id,contact_id,branch_id,assignee_user_id,team_id,assigned_by,starts_at,reason,created_at)
               VALUES('handoff-team-assignment',?,?,NULL,?,?,?,?,?)""",
            (contact_id, branch_id, team_id, admin_user_id, transition_at,
             "Transferred to the follow-up team", transition_at),
        )
        self.assertEqual(
            self.db.execute(
                "SELECT COUNT(*) FROM contact_assignment WHERE contact_id=? AND team_id=? AND ends_at IS NULL",
                (contact_id, team_id),
            ).fetchone()[0],
            1,
        )
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CONTACT_ASSIGNMENT_ALREADY_ENDED"):
            self.db.execute(
                "UPDATE contact_assignment SET ends_at=? WHERE id=?",
                ("2026-11-27T12:00:00.000Z", assignment_id),
            )

    def test_owner_cleanup_refuses_non_production_database(self):
        environment = self.db.execute(
            "SELECT environment FROM app_meta WHERE id = 1"
        ).fetchone()[0]
        self.assertEqual(environment, "non-production")
        cleanup = (Path(__file__).resolve().parents[1] / "scripts" / "remove_test_staff_logins.sql").read_text(encoding="utf-8")

        with self.assertRaises(sqlite3.IntegrityError):
            self.db.executescript(cleanup)

    def test_owner_cleanup_removes_test_logins_but_preserves_staff_history_and_allows_reuse(self):
        now = "2026-11-23T23:00:00.000Z"
        owner_profile = "ff3da224-34df-4702-93fd-6011cc52e4e9"
        owner_user = "ed68338d-3edd-4720-a30a-16f590c8ada2"
        nyarko_profile = "d5c922ca-0e64-4a65-b14e-128c9131f79c"
        nyarko_user = "a75f19b8-be85-4a90-835c-d8848bad8bc1"
        nana_profile = "d9c55d3f-ec29-457f-a131-621a72d326e9"
        nana_user = "b831e1e5-e2f5-4257-bd90-e7c84c4e6c91"
        branch_id = "2951a1c3-fb47-49c1-a83a-435daf3419c2"

        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            ("cleanup-church", "Cleanup Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (branch_id, "cleanup-church", "Cleanup Branch", "Africa/Accra", now, now),
        )

        for user_id, name, email in (
            (owner_user, "Elvis", "elviskwakuboateng63@gmail.com"),
            (nyarko_user, "Nyarko", "eltech6363@gmail.com"),
            (nana_user, "Nana", "nanaseiboateng15@gmail.com"),
        ):
            self.db.execute(
                'INSERT INTO "user"(id,name,email,emailVerified,image,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
                (user_id, name, email, 1, None, 1, 1),
            )
            self.db.execute(
                "INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,1,1)",
                (user_id + ":credential", user_id, user_id, "synthetic-bcrypt-hash"),
            )
        for profile_id, user_id, name, email, status, must_change, setup_expires_at in (
            (owner_profile, owner_user, "Elvis", "elviskwakuboateng63@gmail.com", "active", 0, None),
            (nyarko_profile, nyarko_user, "Nyarko", "eltech6363@gmail.com", "active", 1, "2026-11-13T21:25:46.391Z"),
            (nana_profile, nana_user, "Nana", "nanaseiboateng15@gmail.com", "inactive", 1, "2026-11-21T20:18:20.336Z"),
        ):
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,email,account_status,deactivated_at,created_at,updated_at,must_change_password,password_setup_expires_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (profile_id, user_id, name, email, status, now if status == "inactive" else None, now, now, must_change, setup_expires_at),
            )
        self.db.executemany(
            """INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId)
               VALUES(?,?,?,?,?,?)""",
            (
                ("nyarko-session", 9999999999, "nyarko-test-session", 1, 1, nyarko_user),
                ("nana-session", 9999999999, "nana-test-session", 1, 1, nana_user),
            ),
        )
        self.db.execute(
            "UPDATE staff_admin_bootstrap_state SET remaining_slots=1 WHERE id=1"
        )
        admin_role = self.db.execute("SELECT id FROM role WHERE code='admin_pastor'").fetchone()[0]
        team_role = self.db.execute("SELECT id FROM role WHERE code='team_leader'").fetchone()[0]
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES('cleanup-owner-admin-assignment',?,?,?,?,?,?)""",
            (owner_profile, admin_role, branch_id, owner_profile, now, now),
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES('b17e5a7f-a359-49c2-9cb6-a73f0245117d',?,?,?,?,?,?)""",
            (nana_profile, team_role, branch_id, owner_profile, now, now),
        )
        self.db.executemany(
            """INSERT INTO staff_access_audit
               (id,branch_id,actor_profile_id,target_profile_id,action,reason,metadata,created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (
                ("cleanup-nyarko-created", branch_id, owner_profile, nyarko_profile,
                 "account_created", "Created test staff account for onboarding verification", "{}", now),
                ("cleanup-nana-created", branch_id, owner_profile, nana_profile,
                 "account_created", "Created test staff account for onboarding verification", "{}", now),
            ),
        )

        self.db.execute("UPDATE app_meta SET environment='production' WHERE id=1")
        cleanup = Path(__file__).resolve().parents[1] / "scripts" / "remove_test_staff_logins.sql"
        script = cleanup.read_text(encoding="utf-8")
        self.db.executescript(script)
        # A retry must be harmless and must not duplicate the completion audit.
        self.db.executescript(script)

        self.assertEqual(
            self.db.execute("SELECT email FROM \"user\" WHERE id=?", (owner_user,)).fetchone()[0],
            "elviskwakuboateng63@gmail.com",
        )
        self.assertEqual(
            self.db.execute("SELECT account_status FROM staff_profile WHERE id=?", (owner_profile,)).fetchone()[0],
            "active",
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_role_assignment WHERE staff_profile_id=? AND revoked_at IS NULL", (owner_profile,)).fetchone()[0],
            1,
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM account WHERE userId=?", (owner_user,)).fetchone()[0],
            1,
        )

        for profile_id, user_id in ((nyarko_profile, nyarko_user), (nana_profile, nana_user)):
            profile = self.db.execute(
                "SELECT full_name,email,account_status,must_change_password,password_setup_expires_at FROM staff_profile WHERE id=?",
                (profile_id,),
            ).fetchone()
            self.assertEqual(profile, ("Removed test account", None, "inactive", 1, None))
            user = self.db.execute('SELECT name,email,emailVerified FROM "user" WHERE id=?', (user_id,)).fetchone()
            self.assertEqual(user, ("Removed test account", "removed+" + user_id + "@invalid.example", 0))
            self.assertEqual(self.db.execute("SELECT COUNT(*) FROM account WHERE userId=?", (user_id,)).fetchone()[0], 0)
            self.assertEqual(self.db.execute("SELECT COUNT(*) FROM session WHERE userId=?", (user_id,)).fetchone()[0], 0)
            self.assertEqual(
                self.db.execute("SELECT COUNT(*) FROM staff_role_assignment WHERE staff_profile_id=? AND revoked_at IS NULL", (profile_id,)).fetchone()[0],
                0,
            )

        self.assertEqual(
            self.db.execute('SELECT COUNT(*) FROM "user" WHERE email IN (?,?)',
                            ("eltech6363@gmail.com", "nanaseiboateng15@gmail.com")).fetchone()[0],
            0,
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_profile WHERE email IN (?,?)",
                            ("eltech6363@gmail.com", "nanaseiboateng15@gmail.com")).fetchone()[0],
            0,
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_access_audit WHERE id LIKE 'owner-test-login-removal-complete-%'").fetchone()[0],
            2,
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_account_audit WHERE target_profile_id=? AND action='account_deactivated'", (nana_profile,)).fetchone()[0],
            1,
        )
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_report_event_registration_checkin_and_closeout_lifecycle(self):
        now = "2026-11-22T23:00:00.000Z"
        church_id = "acceptance-church"
        branch_id = "acceptance-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Acceptance Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (branch_id, church_id, "Acceptance Branch", "Africa/Accra", now, now),
        )

        identities = {
            "author": ("acceptance-author-user", "acceptance-author-profile", "Field Worker", "author@example.test", "field_worker"),
            "admin": ("acceptance-admin-user", "acceptance-admin-profile", "Admin Pastor", "admin@example.test", "admin_pastor"),
            "reviewer": ("acceptance-reviewer-user", "acceptance-reviewer-profile", "Coordinator", "reviewer@example.test", "coordinator"),
        }
        for key, (user_id, profile_id, name, email, role_code) in identities.items():
            self.db.execute(
                'INSERT INTO "user"(id,name,email,emailVerified,image,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
                (user_id, name, email, 1, None, 1795390000000, 1795390000000),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,email,account_status,created_at,updated_at,must_change_password)
                   VALUES(?,?,?,?,'active',?,?,0)""",
                (profile_id, user_id, name, email, now, now),
            )
        for key, (user_id, profile_id, name, email, role_code) in identities.items():
            role_id = self.db.execute("SELECT id FROM role WHERE code=?", (role_code,)).fetchone()[0]
            assigned_by = identities["admin"][1] if key != "admin" else profile_id
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                ("assignment-" + key, profile_id, role_id, branch_id, assigned_by, "2026-11-01T00:00:00.000Z", now),
            )

        author_user, author_profile = identities["author"][0], identities["author"][1]
        admin_user, admin_profile = identities["admin"][0], identities["admin"][1]
        reviewer_user, reviewer_profile = identities["reviewer"][0], identities["reviewer"][1]

        event_id = "acceptance-event"
        self.db.execute(
            """INSERT INTO event
               (id,branch_id,title,starts_at,ends_at,timezone,registration_state,visibility,status,created_by,last_modified_by,created_at,updated_at)
               VALUES(?,?,?,'2026-11-30T10:00:00.000Z','2026-11-30T11:00:00.000Z',
                      'Africa/Accra','open','staff','published',?,?,?,?)""",
            (event_id, branch_id, "Acceptance Event", admin_user, admin_user, now, now),
        )
        self.db.execute(
            """INSERT INTO event_staff_assignment
               (id,event_id,branch_id,staff_auth_user_id,assignment_role,assigned_by,starts_at,created_at)
               VALUES(?,?,?,?, 'owner',?,?,?)""",
            ("acceptance-event-assignment", event_id, branch_id, author_user, admin_user, now, now),
        )
        registration_id = "acceptance-registration"
        self.db.execute(
            """INSERT INTO event_registration
               (id,event_id,branch_id,attendee_name_snapshot,registration_source,status,registered_at,client_request_id,created_by)
               VALUES(?,?,?,'Synthetic Guest','staff','registered',?,?,?)""",
            (registration_id, event_id, branch_id, now, "acceptance-register-1", author_user),
        )
        self.db.execute(
            """INSERT INTO event_checkin
               (id,event_id,branch_id,registration_id,attendee_name_snapshot,checked_in_at,recorded_by,source,client_request_id)
               VALUES(?,?,?,?,?,?,?,'staff',?)""",
            ("acceptance-checkin", event_id, branch_id, registration_id, "Synthetic Guest", now, author_user, "acceptance-checkin-1"),
        )
        self.db.execute(
            "UPDATE event_registration SET status='attended' WHERE id=?",
            (registration_id,),
        )

        closeout_id = "acceptance-closeout"
        self.db.execute(
            """INSERT INTO event_closeout
               (id,event_id,branch_id,submitted_by,submitted_at,status,attendee_count,registration_count,
                transport_seat_count,summary_notes,created_at,updated_at)
               VALUES(?,?,?,?,?,'submitted',1,1,0,'Synthetic acceptance run',?,?)""",
            (closeout_id, event_id, branch_id, admin_user, now, now, now),
        )
        self.db.execute(
            """INSERT INTO event_closeout_event
               (id,closeout_id,actor_user_id,action,details,created_at)
               VALUES(?,?,?,'submitted','{"attendee_count":1}',?)""",
            ("acceptance-closeout-submitted", closeout_id, admin_user, now),
        )
        self.db.execute(
            "UPDATE event_closeout SET status='approved',reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?",
            (reviewer_user, now, now, closeout_id),
        )
        self.db.execute(
            """INSERT INTO event_closeout_event
               (id,closeout_id,actor_user_id,action,details,created_at)
               VALUES(?,?,?,'approved','{"reason":"Acceptance reviewer approval"}',?)""",
            ("acceptance-closeout-approved", closeout_id, reviewer_user, now),
        )

        report_id = "acceptance-report"
        self.db.execute(
            """INSERT INTO ministry_report
               (id,branch_id,report_type,period_start,period_end,author_profile_id,
                contacts_captured,gospel_presentations,decisions_for_christ,followup_required,followup_completed,
                visits_completed,calls_completed,events_supported,attendance_count,status,submitted_at,
                created_at,updated_at,created_by,updated_by)
               VALUES(?,?, 'daily_evangelism','2026-11-22','2026-11-22',?,
                       1,1,1,1,0,0,0,0,0,'submitted',?,?,?,?,?)""",
            (report_id, branch_id, author_profile, now, now, now, author_user, author_user),
        )
        self.db.execute(
            """UPDATE ministry_report
               SET status='approved',last_action_id='acceptance-report-review',
                   last_action_by=?,last_action_decision='approved',
                   last_action_comment='Synthetic acceptance approval',
                   last_action_at=?,updated_at=?,updated_by=?
               WHERE id=? AND status='submitted'""",
            (admin_user, now, now, admin_user, report_id),
        )

        self.assertEqual(
            self.db.execute("SELECT status FROM ministry_report WHERE id=?", (report_id,)).fetchone()[0],
            "approved",
        )
        self.assertEqual(
            self.db.execute("SELECT decision FROM report_review_event WHERE report_id=?", (report_id,)).fetchone()[0],
            "approved",
        )
        self.assertEqual(
            self.db.execute("SELECT status FROM event_registration WHERE id=?", (registration_id,)).fetchone()[0],
            "attended",
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM event_checkin WHERE event_id=?", (event_id,)).fetchone()[0],
            1,
        )
        self.assertEqual(
            self.db.execute("SELECT status FROM event_closeout WHERE id=?", (closeout_id,)).fetchone()[0],
            "approved",
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM event_closeout_event WHERE closeout_id=?", (closeout_id,)).fetchone()[0],
            2,
        )
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_team_and_area_management_are_branch_scoped_and_admin_only(self):
        self.assertEqual(
            self.grants("admin_pastor")
            & {("team.manage", "branch"), ("area.manage", "branch")},
            {("team.manage", "branch"), ("area.manage", "branch")},
        )
        for role_code in (
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        ):
            self.assertFalse(
                self.grants(role_code)
                & {("team.manage", "branch"), ("area.manage", "branch")},
                f"{role_code} must not receive branch team/area administration",
            )

    def test_management_grants_are_not_implicitly_widened_to_other_scopes(self):
        for role_code in (
            "admin_pastor",
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        ):
            self.assertEqual(
                {grant for grant in self.grants(role_code) if grant[0] in ("team.manage", "area.manage")},
                {("team.manage", "branch"), ("area.manage", "branch")} if role_code == "admin_pastor" else set(),
            )


    def test_live_source_grants_and_worker_aliases_are_least_privilege(self):
        expected_counts = {
            "admin_pastor": 56,
            "coordinator": 25,
            "field_worker": 19,
            "follow_up_volunteer": 13,
            "prayer_intercessor": 1,
            "team_leader": 26,
        }
        actual_counts = {
            row[0]: row[1]
            for row in self.db.execute(
                """
                SELECT r.code, COUNT(*)
                FROM role_capability rc
                JOIN role r ON r.id = rc.role_id
                JOIN capability c ON c.id = rc.capability_id
                WHERE r.is_active = 1 AND c.is_active = 1
                GROUP BY r.code
                """
            )
        }
        self.assertEqual(actual_counts, expected_counts)
        self.assertEqual(sum(actual_counts.values()), 140)
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM capability WHERE is_active = 1").fetchone()[0],
            89,
        )

        admin = self.grants("admin_pastor")
        coordinator = self.grants("coordinator")
        field_worker = self.grants("field_worker")
        follow_up = self.grants("follow_up_volunteer")
        prayer = self.grants("prayer_intercessor")
        team_leader = self.grants("team_leader")

        # The frontend's canonical capabilities and Worker compatibility names
        # must carry the same role/scope from the live CMI grant matrix.
        self.assertIn(("contact.read.scoped", "branch"), admin)
        self.assertIn(("contacts.read", "branch"), admin)
        self.assertIn(("contact.read.scoped", "branch"), coordinator)
        self.assertIn(("contacts.read", "branch"), coordinator)
        self.assertIn(("contact.read.scoped", "assigned"), field_worker)
        self.assertIn(("contacts.read", "assigned"), field_worker)
        self.assertIn(("contact.read.scoped", "assigned"), follow_up)
        self.assertIn(("contacts.read", "assigned"), follow_up)
        self.assertIn(("contact.read.scoped", "team"), team_leader)
        self.assertIn(("contacts.read", "team"), team_leader)

        # Contact identity/private details remain Admin/Pastor-only.
        for grants in (coordinator, field_worker, follow_up, team_leader, prayer):
            self.assertFalse(
                grants
                & {
                    ("contact.identity.read.scoped", "branch"),
                    ("contacts.contact_details.read", "branch"),
                    ("contacts.private_fields.read", "branch"),
                }
            )

        # Staff governance and account security stay Admin/Pastor-only.
        self.assertIn(("access.role.assign", "branch"), admin)
        self.assertIn(("staff.role.assign", "branch"), admin)
        self.assertIn(("staff.role.approve", "branch"), admin)
        self.assertIn(("staff.account.manage", "branch"), admin)
        for grants in (coordinator, field_worker, follow_up, prayer, team_leader):
            self.assertFalse(
                {
                    ("staff.role.assign", "branch"),
                    ("staff.role.approve", "branch"),
                    ("staff.account.manage", "branch"),
                    ("staff.directory.read", "branch"),
                } & grants
            )

        # Intercessors receive only the assigned-request source capability.
        self.assertEqual(prayer, {("prayer.request.read.assigned", "assigned")})
        # No staff role receives an SMS dispatch/configuration grant.
        all_grants = [
            row[0]
            for row in self.db.execute(
                """
                SELECT c.code
                FROM role_capability rc
                JOIN capability c ON c.id = rc.capability_id
                """
            )
        ]
        self.assertFalse(any(code.startswith("sms.") for code in all_grants))

    def test_all_canonical_grants_match_the_live_source_policy(self):
        migration = (MIGRATIONS / "0041_align_live_authorization_catalogue.sql").read_text(encoding="utf-8")
        start = migration.index("WITH source_grants(")
        end = migration.index("\n)\nINSERT INTO role_capability", start)
        expected = {
            (role_code, capability_code, scope_mode)
            for role_code, capability_code, scope_mode in re.findall(
                r"\('([^']+)','([^']+)','([^']+)','[^']+'\)",
                migration[start:end],
            )
        }
        self.assertEqual(len(expected), 65)

        capability_codes = sorted({code for _, code, _ in expected})
        placeholders = ",".join("?" for _ in capability_codes)
        actual = {
            (row[0], row[1], row[2])
            for row in self.db.execute(
                f"""
                SELECT r.code, c.code, rc.scope_mode
                FROM role_capability rc
                JOIN role r ON r.id = rc.role_id
                JOIN capability c ON c.id = rc.capability_id
                WHERE c.code IN ({placeholders})
                """,
                capability_codes,
            )
        }
        self.assertEqual(actual, expected, "D1 canonical grants must exactly match the six-role source policy")

    def test_directory_capabilities_have_only_the_approved_eight_grants(self):
        expected = {
            "admin_pastor": {
                ("team.manage", "branch"), ("area.manage", "branch"),
                ("team.read", "branch"), ("area.read", "branch"),
            },
            "coordinator": {("team.read", "branch"), ("area.read", "branch")},
            "team_leader": {("team.read", "team"), ("area.read", "team")},
            "field_worker": set(),
            "follow_up_volunteer": set(),
            "prayer_intercessor": set(),
        }
        for role_code, allowed in expected.items():
            actual = {
                grant for grant in self.grants(role_code)
                if grant[0] in {"team.manage", "area.manage", "team.read", "area.read"}
            }
            self.assertEqual(actual, allowed, f"unexpected team/area scope for {role_code}")

    def test_worker_compatibility_grants_match_the_explicit_migration_allowlist(self):
        migration = (MIGRATIONS / "0042_worker_route_capability_compatibility.sql").read_text(encoding="utf-8")
        start = migration.index("WITH worker_aliases(")
        end = migration.index("\n)\nINSERT INTO role_capability", start)
        declared = {
            (role_code, capability_code, scope_mode)
            for role_code, capability_code, scope_mode in re.findall(
                r"\('([^']+)','([^']+)','([^']+)','[^']+'\)",
                migration[start:end],
            )
        }
        self.assertEqual(len(declared), 55, "compatibility allowlist changed; review the policy before updating the test")

        capability_codes = sorted({code for _, code, _ in declared})
        placeholders = ",".join("?" for _ in capability_codes)
        actual = {
            (row[0], row[1], row[2])
            for row in self.db.execute(
                f"""
                SELECT r.code, c.code, rc.scope_mode
                FROM role_capability rc
                JOIN role r ON r.id = rc.role_id
                JOIN capability c ON c.id = rc.capability_id
                WHERE c.code IN ({placeholders})
                """,
                capability_codes,
            )
        }
        self.assertEqual(actual, declared, "Worker aliases must not gain unreviewed roles or wider scopes")

        self.assertFalse(
            self.db.execute(
                """
                SELECT 1 FROM role_capability rc
                JOIN capability c ON c.id = rc.capability_id
                WHERE c.code LIKE 'sms.%' LIMIT 1
                """
            ).fetchone(),
            "SMS must remain ungranted while the provider integration is disabled",
        )
        self.assertFalse(
            self.db.execute(
                """
                SELECT 1 FROM role_capability rc
                JOIN capability c ON c.id = rc.capability_id
                WHERE c.code IN ('prayer.request.read', 'prayer.request.share')
                LIMIT 1
                """
            ).fetchone(),
            "legacy broad prayer-read/share aliases must not be granted",
        )

    def test_sensitive_pastoral_read_grants_are_minimal_across_all_six_roles(self):
        expected = {
            "admin_pastor": {
                ("care.oversight.read", "oversight"),
                ("prayer.oversight.read", "oversight"),
            },
            "coordinator": set(),
            "team_leader": set(),
            "field_worker": set(),
            "follow_up_volunteer": set(),
            "prayer_intercessor": {
                ("prayer.request.read.assigned", "assigned"),
            },
        }
        sensitive_codes = {
            "care.oversight.read",
            "care.record.read.assigned",
            "prayer.oversight.read",
            "prayer.request.read.assigned",
        }
        for role_code, allowed in expected.items():
            actual = {
                grant for grant in self.grants(role_code)
                if grant[0] in sensitive_codes
            }
            self.assertEqual(actual, allowed, f"unexpected sensitive-read grants for {role_code}")

    def test_six_role_pastoral_grants_require_an_active_branch_assignment(self):
        now = "2026-11-22T12:00:00.000Z"
        church_id = "pastoral-authz-church"
        branch_id = "pastoral-authz-branch"
        other_branch_id = "pastoral-authz-other-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Pastoral Authorization Test Church", now, now),
        )
        self.db.execute(
            """INSERT INTO branch(id,church_id,name,created_at,updated_at)
               VALUES(?,?,?,?,?),(?,?,?,?,?)""",
            (branch_id, church_id, "Assigned Branch", now, now,
             other_branch_id, church_id, "Other Branch", now, now),
        )
        role_codes = (
            "admin_pastor", "coordinator", "team_leader",
            "field_worker", "follow_up_volunteer", "prayer_intercessor",
        )
        profiles = {}
        for index, role_code in enumerate(role_codes, start=1):
            auth_id = f"pastoral-authz-user-{index}"
            profile_id = f"pastoral-authz-staff-{index}"
            role_id = self.db.execute(
                "SELECT id FROM role WHERE code = ?", (role_code,)
            ).fetchone()[0]
            self.db.execute(
                """INSERT INTO "user"
                   (id,name,email,emailVerified,createdAt,updatedAt)
                   VALUES(?,?,?,?,?,?)""",
                (auth_id, role_code, f"{role_code}@pastoral.example.test", 1, 1, 1),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,account_status,created_at,updated_at,must_change_password)
                   VALUES(?,?,?,'active',?,?,0)""",
                (profile_id, auth_id, role_code, now, now),
            )
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (f"pastoral-authz-assignment-{index}", profile_id, role_id, branch_id, profile_id, now, now),
            )
            profiles[role_code] = profile_id

        expected = {
            "admin_pastor": {
                ("care.oversight.read", "oversight"),
                ("prayer.oversight.read", "oversight"),
            },
            "coordinator": set(),
            "team_leader": set(),
            "field_worker": set(),
            "follow_up_volunteer": set(),
            "prayer_intercessor": {
                ("prayer.request.read.assigned", "assigned"),
            },
        }
        sensitive = {
            "care.oversight.read",
            "care.record.read.assigned",
            "prayer.oversight.read",
            "prayer.request.read.assigned",
        }
        for role_code in role_codes:
            profile_id = profiles[role_code]
            with self.subTest(role=role_code):
                assignment = self.db.execute(
                    """SELECT 1 FROM staff_role_assignment sra
                       JOIN staff_profile sp ON sp.id = sra.staff_profile_id
                       JOIN branch b ON b.id = sra.branch_id
                       WHERE sra.staff_profile_id = ? AND sra.branch_id = ?
                         AND sp.account_status = 'active' AND b.is_active = 1
                         AND sra.revoked_at IS NULL AND sra.starts_at <= ?
                         AND (sra.ends_at IS NULL OR sra.ends_at > ?)""",
                    (profile_id, branch_id, now, now),
                ).fetchone()
                self.assertIsNotNone(assignment)
                self.assertIsNone(
                    self.db.execute(
                        "SELECT 1 FROM staff_role_assignment WHERE staff_profile_id = ? AND branch_id = ?",
                        (profile_id, other_branch_id),
                    ).fetchone()
                )
                actual_sensitive = {grant for grant in self.grants(role_code) if grant[0] in sensitive}
                self.assertEqual(actual_sensitive, expected[role_code], f"{role_code} actual sensitive grants: {sorted(actual_sensitive)}")

    def test_worker_authorization_sql_allows_team_area_management_only_for_admin_pastor(self):
        now = "2026-11-21T12:00:00.000Z"
        church_id = "authz-cmi-church"
        branch_id = "authz-cmi-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Authorization Test Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
            (branch_id, church_id, "Authorization Test Branch", now, now),
        )

        role_codes = (
            "admin_pastor",
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        )
        profiles = {}
        for index, role_code in enumerate(role_codes, start=1):
            auth_id = f"authz-cmi-user-{index}"
            profile_id = f"authz-cmi-staff-{index}"
            role_id = self.db.execute(
                "SELECT id FROM role WHERE code = ?", (role_code,)
            ).fetchone()[0]
            self.db.execute(
                """INSERT INTO "user"
                   (id,name,email,emailVerified,createdAt,updatedAt)
                   VALUES(?,?,?,?,?,?)""",
                (auth_id, role_code, f"{role_code}@example.test", 1, 1, 1),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,account_status,created_at,updated_at,
                    must_change_password)
                   VALUES(?,?,?,'active',?,?,0)""",
                (profile_id, auth_id, role_code, now, now),
            )
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (
                    f"authz-cmi-assignment-{index}",
                    profile_id,
                    role_id,
                    branch_id,
                    profile_id,
                    now,
                    now,
                ),
            )
            profiles[role_code] = profile_id

        source = (Path(__file__).resolve().parents[1] / "src" / "authorization.ts").read_text(encoding="utf-8")
        match = re.search(r"const AUTHORIZATION_SQL = `([\s\S]*?)`;", source)
        self.assertIsNotNone(match, "Worker authorization query must remain statically testable")
        query = match.group(1)

        def authorize(profile_id, capability, selected_branch=branch_id):
            values = (
                selected_branch, profile_id, capability, now, now,
                "", "", now, now,
                "", "", "", now, now,
                "", "", "",
                "", "", "", "",
                now, now, "", "", profile_id,
            )
            self.assertEqual(query.count("?"), len(values))
            return self.db.execute(query, values).fetchone()

        for capability in ("team.manage", "area.manage"):
            self.assertIsNotNone(authorize(profiles["admin_pastor"], capability))
            for role_code in role_codes[1:]:
                with self.subTest(role=role_code, capability=capability):
                    self.assertIsNone(authorize(profiles[role_code], capability))
            self.assertIsNone(
                authorize(
                    profiles["admin_pastor"],
                    capability,
                    "authz-cmi-unassigned-branch",
                )
            )

    def test_directory_read_grants_are_role_and_scope_limited(self):
        self.assertIn(("team.read", "branch"), self.grants("admin_pastor"))
        self.assertIn(("area.read", "branch"), self.grants("admin_pastor"))
        self.assertIn(("team.read", "branch"), self.grants("coordinator"))
        self.assertIn(("area.read", "branch"), self.grants("coordinator"))
        self.assertIn(("team.read", "team"), self.grants("team_leader"))
        self.assertIn(("area.read", "team"), self.grants("team_leader"))
        for role_code in ("field_worker", "follow_up_volunteer", "prayer_intercessor"):
            self.assertFalse(
                {grant for grant in self.grants(role_code) if grant[0] in ("team.read", "area.read")},
                f"{role_code} must not receive a team/service-area directory grant",
            )

    def test_directory_read_migration_is_idempotent(self):
        migration = (MIGRATIONS / "0039_team_area_directory_read_grants.sql").read_text(encoding="utf-8")
        before = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.db.executescript(migration)
        after = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.assertEqual(after, before)
        self.assertEqual(
            self.db.execute("SELECT schema_version FROM app_meta WHERE id = 1").fetchone()[0],
            47,
        )

    def test_worker_authorization_query_enforces_team_leader_membership_for_directory_read(self):
        now = "2026-11-21T12:00:00.000Z"
        church_id = "team-read-church"
        branch_id = "team-read-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Team Read Test Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
            (branch_id, church_id, "Team Read Test Branch", now, now),
        )
        team_id = "team-read-own-team"
        other_team_id = "team-read-other-team"
        self.db.execute(
            """INSERT INTO team(id,branch_id,name,description,is_active,created_at,updated_at)
               VALUES(?,?,?,NULL,1,?,?),(?,?,?,NULL,1,?,?)""",
            (team_id, branch_id, "Own Team", now, now, other_team_id, branch_id, "Other Team", now, now),
        )

        role_codes = ("admin_pastor", "coordinator", "team_leader")
        profiles = {}
        for index, role_code in enumerate(role_codes, start=1):
            auth_id = f"team-read-user-{index}"
            profile_id = f"team-read-staff-{index}"
            role_id = self.db.execute(
                "SELECT id FROM role WHERE code = ?", (role_code,)
            ).fetchone()[0]
            self.db.execute(
                """INSERT INTO "user"
                   (id,name,email,emailVerified,createdAt,updatedAt)
                   VALUES(?,?,?,?,?,?)""",
                (auth_id, role_code, f"{role_code}@example.test", 1, 1, 1),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,account_status,created_at,updated_at,must_change_password)
                   VALUES(?,?,?,'active',?,?,0)""",
                (profile_id, auth_id, role_code, now, now),
            )
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (f"team-read-assignment-{index}", profile_id, role_id, branch_id, profile_id, now, now),
            )
            profiles[role_code] = profile_id

        self.db.execute(
            """INSERT INTO staff_team_membership
               (id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at)
               VALUES(?,?,?,?,'leader',?,?,?)""",
            ("team-read-membership", profiles["team_leader"], team_id, branch_id, now, profiles["admin_pastor"], now),
        )

        source = (Path(__file__).resolve().parents[1] / "src" / "authorization.ts").read_text(encoding="utf-8")
        match = re.search(r"const AUTHORIZATION_SQL = \x60([\s\S]*?)\x60;", source)
        self.assertIsNotNone(match)
        query = match.group(1)

        def authorize(profile_id, capability, resource_team_id=""):
            values = (
                branch_id, profile_id, capability, now, now,
                resource_team_id, resource_team_id, now, now,
                "", "", "", now, now,
                "", "", "",
                "", "", "", "",
                now, now, "", "", profile_id,
            )
            self.assertEqual(query.count("?"), len(values))
            return self.db.execute(query, values).fetchone()

        self.assertIsNotNone(authorize(profiles["admin_pastor"], "team.read"))
        self.assertIsNotNone(authorize(profiles["coordinator"], "team.read"))
        self.assertIsNotNone(authorize(profiles["admin_pastor"], "area.read"))
        self.assertIsNotNone(authorize(profiles["coordinator"], "area.read"))
        self.assertIsNotNone(authorize(profiles["team_leader"], "team.read", team_id))
        self.assertIsNone(authorize(profiles["team_leader"], "team.read", other_team_id))
        self.assertIsNotNone(authorize(profiles["team_leader"], "area.read", team_id))
        self.assertIsNone(authorize(profiles["team_leader"], "area.read", other_team_id))

    def test_role_grant_migration_is_idempotent(self):
        before = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.db.executescript(
            (MIGRATIONS / "0038_admin_pastor_team_area_management_grants.sql").read_text(encoding="utf-8")
        )
        after = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.assertEqual(after, before)
        self.assertEqual(
            self.db.execute("SELECT schema_version FROM app_meta WHERE id = 1").fetchone()[0],
            47,
        )

    
    def test_historical_admin_assignment_import_does_not_consume_bootstrap_or_add_audit(self):
        now = "2026-11-22T00:00:00.000Z"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            ("import-guard-church", "Import Guard Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
            ("import-guard-branch", "import-guard-church", "Import Guard Branch", now, now),
        )
        for profile_id in ("import-guard-actor", "import-guard-target"):
            auth_id = f"auth-{profile_id}"
            self.db.execute(
                """INSERT INTO "user"
                   (id,name,email,emailVerified,createdAt,updatedAt,auth_provider)
                   VALUES(?,?,?,?,?,?,?)""",
                (auth_id, profile_id, f"{profile_id}@example.test", 1, 1795305600000, 1795305600000, "supabase"),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,account_status,created_at,updated_at)
                   VALUES(?,?,?,?,?,?)""",
                (profile_id, auth_id, profile_id, "active", now, now),
            )
        admin_role_id = self.db.execute(
            "SELECT id FROM role WHERE code = 'admin_pastor'"
        ).fetchone()[0]

        self.db.execute(
            "UPDATE data_migration_control SET is_active = 1 WHERE import_key = 'supabase_core_identity'"
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES(?,?,?,?,?,?,?)""",
            ("import-guard-assignment", "import-guard-target", admin_role_id,
             "import-guard-branch", "import-guard-actor", now, now),
        )
        self.assertEqual(
            self.db.execute("SELECT remaining_slots FROM staff_admin_bootstrap_state WHERE id = 1").fetchone()[0],
            2,
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_access_audit").fetchone()[0],
            0,
        )

        self.db.execute(
            "UPDATE data_migration_control SET is_active = 0 WHERE import_key = 'supabase_core_identity'"
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
               VALUES(?,?,?,?,?,?,?)""",
            ("import-guard-live-assignment", "import-guard-actor", admin_role_id,
             "import-guard-branch", "import-guard-target", now, now),
        )
        self.assertEqual(
            self.db.execute("SELECT remaining_slots FROM staff_admin_bootstrap_state WHERE id = 1").fetchone()[0],
            1,
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_access_audit").fetchone()[0],
            1,
        )

    def test_environment_marker_allows_production_but_rejects_other_values(self):
        self.db.execute("UPDATE app_meta SET environment = 'production' WHERE id = 1")
        self.assertEqual(
            self.db.execute("SELECT environment FROM app_meta WHERE id = 1").fetchone()[0],
            "production",
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE app_meta SET environment = 'staging' WHERE id = 1")

    def test_environment_marker_migration_aborts_before_dropping_wrong_schema(self):
        isolated = sqlite3.connect(":memory:")
        isolated.execute("PRAGMA foreign_keys = ON")
        try:
            for migration_file in sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql")):
                if migration_file.name in {"0040_production_environment_marker.sql", "0041_align_live_authorization_catalogue.sql", "0042_worker_route_capability_compatibility.sql", "0043_supabase_identity_import_controls.sql", "0044_restore_better_auth_identity.sql", "0045_promote_production_environment.sql", "0046_restore_report_and_event_capabilities.sql"}:
                    continue
                isolated.executescript(migration_file.read_text(encoding="utf-8"))
            isolated.execute("UPDATE app_meta SET schema_version = 38 WHERE id = 1")
            with self.assertRaises(sqlite3.IntegrityError):
                isolated.executescript(
                    (MIGRATIONS / "0040_production_environment_marker.sql").read_text(encoding="utf-8")
                )
            self.assertEqual(
                isolated.execute("SELECT schema_version, environment FROM app_meta WHERE id = 1").fetchone(),
                (38, "non-production"),
            )
        finally:
            isolated.close()


if __name__ == "__main__":
    unittest.main()
