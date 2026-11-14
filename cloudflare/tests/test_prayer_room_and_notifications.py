from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKER = (ROOT / "cloudflare" / "src" / "index.ts").read_text(encoding="utf-8")
MIGRATION = (ROOT / "cloudflare" / "migrations" / "0029_prayer_room_and_notification_inbox.sql").read_text(encoding="utf-8")
API = (ROOT / "web" / "src" / "lib" / "cmi-api.ts").read_text(encoding="utf-8")
UI = (ROOT / "web" / "src" / "components" / "PrayerRoomWorkspace.tsx").read_text(encoding="utf-8")


class PrayerRoomAndNotificationContractTests(unittest.TestCase):
    def test_prayer_room_is_granted_only_to_the_six_defined_staff_roles(self):
        for role in ("admin_pastor", "coordinator", "team_leader", "field_worker", "follow_up_volunteer", "prayer_intercessor"):
            self.assertIn(role, MIGRATION)
        self.assertIn("'prayer.room.read'", MIGRATION)
        self.assertIn("'prayer.room.post'", MIGRATION)
        self.assertIn("scope_mode", MIGRATION)

    def test_prayer_room_message_storage_is_branch_scoped_and_append_only(self):
        self.assertIn("CREATE TABLE prayer_room_message", MIGRATION)
        self.assertIn("branch_id TEXT NOT NULL REFERENCES branch(id)", MIGRATION)
        self.assertIn("body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000)", MIGRATION)
        self.assertIn("prayer_room_message_no_update", MIGRATION)
        self.assertIn("prayer_room_message_no_delete", MIGRATION)
        self.assertIn("prayer_room_access_audit_authorize_insert", MIGRATION)
        self.assertIn("CREATE TABLE web_push_vapid_key", MIGRATION)
        self.assertIn("CREATE TABLE staff_push_subscription", MIGRATION)

    def test_prayer_room_post_route_uses_server_identity_and_capability_gate(self):
        handler = re.search(r"async function postPrayerRoomMessage\([\s\S]*?\n\}", WORKER)
        self.assertIsNotNone(handler)
        code = handler.group(0)
        self.assertIn('authorizeRequestCapability(request, env, "prayer.room.post")', code)
        self.assertIn("access.staff.profileId", code)
        self.assertIn("PRAYER_ROOM_MESSAGE_LENGTH", code)
        self.assertIn("PRAYER_ROOM_RATE_LIMITED", code)
        self.assertIn("prayer_room_access_audit", code)
        self.assertIn('"/api/v1/prayer-room/messages"', WORKER)

    def test_prayer_room_read_is_audited_before_messages_are_returned(self):
        handler = re.search(r"async function listPrayerRoomMessages\([\s\S]*?\n\}", WORKER)
        self.assertIsNotNone(handler)
        code = handler.group(0)
        self.assertIn('authorizeRequestCapability(request, env, "prayer.room.read")', code)
        self.assertIn("PRAYER_ROOM_READ_AUDIT_FAILED", code)
        self.assertLess(code.index("prayer_room_access_audit"), code.index("return json(200"))

    def test_announcement_inbox_and_prayer_room_are_exposed_through_browser_client(self):
        self.assertIn("listAnnouncementInbox(branchId", API)
        self.assertIn("markAnnouncementRead(branchId", API)
        self.assertIn("listPrayerRoomMessages(branchId", API)
        self.assertIn("postPrayerRoomMessage(branchId", API)
        self.assertIn("api.postPrayerRoomMessage", UI)

    def test_web_push_uses_encrypted_vapid_key_and_authenticated_subscription_routes(self):
        self.assertIn("async function getWebPushVapidKeys", WORKER)
        self.assertIn("async function savePushSubscription", WORKER)
        self.assertIn("async function sendAnnouncementPushes", WORKER)
        self.assertIn('"/api/v1/notifications/push/public-key"', WORKER)
        self.assertIn('"/api/v1/notifications/push/subscriptions"', WORKER)
        self.assertIn("private_key_ciphertext", MIGRATION)
        self.assertIn("AES-GCM", WORKER)
        self.assertIn("Content-Encoding", WORKER)

    def test_church_wide_announcement_audience_requires_admin_pastor(self):
        handler = re.search(r"async function createAnnouncement\([\s\S]*?\n\}", WORKER)
        self.assertIsNotNone(handler)
        self.assertIn('audience === "staff"', handler.group(0))
        self.assertIn('roles.includes("admin_pastor")', handler.group(0))
        publish = re.search(r"async function publishAnnouncement\([\s\S]*?\n\}", WORKER)
        self.assertIsNotNone(publish)
        self.assertIn("target_branch.church_id=source_branch.church_id", publish.group(0))
        self.assertIn("CHURCH_WIDE_ANNOUNCEMENT_REQUIRES_ADMIN_PASTOR", handler.group(0))


if __name__ == "__main__":
    unittest.main()
