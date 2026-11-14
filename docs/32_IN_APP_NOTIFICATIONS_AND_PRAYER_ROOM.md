# In-app announcements and branch prayer room

## Scope

This feature adds two distinct collaboration surfaces to the Cloudflare-backed staff workspace:

1. **Announcements and notifications** — authorised announcement managers publish a branch announcement. The existing Worker publication transaction fans it out into recipient-scoped `announcement_delivery` rows on the `in_app` channel. Staff see it in the notification bell inbox and can mark it read. No SMS, OTP or email dispatch is part of this workflow.
2. **Prayer room** — a single branch-scoped conversation for prayer points, encouragement and ministry updates. This is the only general message-composition surface. It is not a direct-message system and is not embedded into Contacts, Follow-up, Events, Calendar, Reports or other modules.

Private `prayer_request` and pastoral-care narratives remain separate. Prayer-room messages do not grant access to those restricted records.

## Announcement delivery

- `GET /api/v1/announcements/inbox` returns only the authenticated staff member's delivered in-app items in their active branch.
- `POST /api/v1/announcements/{id}/read` creates an immutable recipient read receipt.
- Announcement managers create a draft with an explicit audience and use `POST /api/v1/announcements/{id}/publish` to publish it.
- Branch audience delivery is available to authorised announcement managers. Church-wide staff audience is restricted to the Admin/Pastor role.
- Delivery is stored in D1 before success is returned. Each recipient is resolved server-side; caller-provided recipient IDs are not trusted.
- The notification bell refreshes the inbox every 20 seconds while the workspace is running. Unread counts and read state remain in-app.
- The notification panel offers an explicit **Enable mobile push** action. It requests permission, registers `/sw.js`, creates a browser Push API subscription and stores its endpoint and encryption keys against the authenticated staff profile.
- The Worker generates one stable VAPID P-256 keypair. The private JWK is encrypted at rest in D1 using an AES-GCM key derived from the existing `BETTER_AUTH_SECRET`; only the public key is returned to the browser. No extra messaging vendor or SMS/email credentials are required.
- When an announcement is published, the Worker first persists recipient-scoped in-app delivery rows, then sends Web Push to each subscribed recipient. Stale 404/410 endpoints are removed. Push provider failures do not undo the in-app delivery.
- Push lock-screen text is deliberately generic ("New church announcement — Open PCG Missions to read the latest update") so the announcement body is not exposed on a locked phone. The full text remains inside the authenticated inbox.
- On iPhone/iPad, Web Push requires PCG Missions to be added to the Home Screen and notification permission granted. Apple supports Web Push for Home Screen web apps on iOS/iPadOS 16.4 and later; see the [Apple Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

## Prayer room API and access

- `GET /api/v1/prayer-room/messages?limit=80`
- `POST /api/v1/prayer-room/messages` with `{ "body": "..." }`
- Both routes require an authenticated staff session and an active branch.
- Read requires `prayer.room.read`; posting requires `prayer.room.post`.
- The migration grants these branch-scoped capabilities to the six existing staff roles: Admin/Pastor, Coordinator, Team Leader, Field Worker, Follow-up Volunteer and Prayer Intercessor.
- Messages are limited to 4,000 characters and are immutable. Reads and posts are recorded in the append-only `prayer_room_access_audit`.
- Message queries are always constrained by the server-resolved active branch. The `branch_id` query parameter is validated against that context and is never used as authority.
- The client refreshes the latest 80 messages every 12 seconds. The room has no direct messages, private side conversations or messaging controls in other modules.

## Migration

`cloudflare/migrations/0029_prayer_room_and_notification_inbox.sql` adds:
- `prayer.room.read` and `prayer.room.post` capabilities and role grants;
- branch-scoped `prayer_room_message` storage with database authorization and immutable-message triggers;
- append-only access audit records;
- schema version 29.

The existing announcement delivery and read-receipt tables from migration 0021 are reused. Migration 0029 also adds encrypted VAPID key storage and per-staff push subscriptions. No production database or Supabase resource is modified by this feature branch.
