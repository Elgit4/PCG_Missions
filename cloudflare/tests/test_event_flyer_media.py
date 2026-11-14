from pathlib import Path
import sqlite3
import unittest


MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0030_event_flyer_media.sql"


class EventFlyerMediaMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("CREATE TABLE app_meta (id INTEGER PRIMARY KEY, environment TEXT NOT NULL, schema_version INTEGER NOT NULL)")
        self.db.execute("INSERT INTO app_meta VALUES (1,'non-production',29)")
        self.db.execute("CREATE TABLE event (id TEXT PRIMARY KEY, flyer_key TEXT, flyer_content_type TEXT, flyer_size INTEGER, flyer_updated_at TEXT)")
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_schema_advances_and_existing_events_remain_without_flyers(self):
        self.assertEqual(self.db.execute("SELECT schema_version FROM app_meta").fetchone()[0], 30)
        self.db.execute("INSERT INTO event(id) VALUES ('legacy-event')")
        self.assertIsNone(self.db.execute("SELECT flyer_key FROM event WHERE id='legacy-event'").fetchone()[0])

    def test_flyer_metadata_must_be_complete(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO event(id,flyer_key) VALUES ('bad-event','events/key.png')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO event(id,flyer_key,flyer_content_type,flyer_size) VALUES ('bad-type','events/key.gif','image/gif',100)")

    def test_duplicate_object_keys_are_rejected(self):
        self.db.execute("INSERT INTO event(id,flyer_key,flyer_content_type,flyer_size) VALUES ('one','events/one.png','image/png',100)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO event(id,flyer_key,flyer_content_type,flyer_size) VALUES ('two','events/one.png','image/png',100)")

    def test_flyer_size_bounds_are_enforced(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO event(id,flyer_key,flyer_content_type,flyer_size) VALUES ('large','events/large.png','image/png',6000000)")


if __name__ == "__main__":
    unittest.main()
