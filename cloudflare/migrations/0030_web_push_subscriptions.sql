-- Web Push subscriptions for in-app announcement alerts.
-- VAPID private material is encrypted by the Worker with a key derived from
-- BETTER_AUTH_SECRET; it is never returned to clients. Only the public key is exposed.

CREATE TABLE web_push_vapid_key (
 id INTEGER PRIMARY KEY CHECK(id=1),
 public_key TEXT NOT NULL,
 private_key_ciphertext TEXT NOT NULL,
 iv TEXT NOT NULL,
 created_at TEXT NOT NULL
);

CREATE TABLE staff_push_subscription (
 id TEXT PRIMARY KEY,
 staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
 endpoint TEXT NOT NULL UNIQUE CHECK(length(endpoint) BETWEEN 40 AND 2048),
 p256dh TEXT NOT NULL CHECK(length(p256dh) BETWEEN 80 AND 100),
 auth_secret TEXT NOT NULL CHECK(length(auth_secret) BETWEEN 16 AND 64),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX staff_push_subscription_profile_idx
 ON staff_push_subscription(staff_profile_id,updated_at DESC);

UPDATE app_meta SET schema_version=30
WHERE id=1 AND environment='non-production' AND schema_version=29;
