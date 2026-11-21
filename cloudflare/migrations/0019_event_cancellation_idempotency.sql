-- Persist the cancellation idempotency key on the resource so concurrent cancellation attempts
-- cannot create a receipt unless that exact transition was applied.
-- Additive non-production migration 0019.

ALTER TABLE event_registration
  ADD COLUMN cancellation_request_key TEXT;
ALTER TABLE transport_reservation
  ADD COLUMN cancellation_request_key TEXT;

CREATE UNIQUE INDEX event_registration_cancel_request_key_idx
  ON event_registration(event_id,cancellation_request_key)
  WHERE cancellation_request_key IS NOT NULL;
CREATE UNIQUE INDEX transport_reservation_cancel_request_key_idx
  ON transport_reservation(event_id,cancellation_request_key)
  WHERE cancellation_request_key IS NOT NULL;

UPDATE app_meta SET schema_version=19 WHERE id=1 AND environment='non-production';
