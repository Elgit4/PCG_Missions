-- Add append-only in-app announcement read receipts and audience-checked delivery.
-- Recipient references are staff_profile IDs, not caller-supplied user IDs.

CREATE TABLE announcement_read_receipt (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  read_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  read_at TEXT NOT NULL,
  UNIQUE(announcement_id,staff_profile_id),
  FOREIGN KEY(announcement_id,branch_id) REFERENCES announcement(id,branch_id) ON DELETE RESTRICT
);

CREATE INDEX announcement_read_receipt_staff_idx
  ON announcement_read_receipt(staff_profile_id,read_at DESC);
CREATE INDEX announcement_delivery_recipient_idx
  ON announcement_delivery(recipient_ref,status,created_at DESC);

CREATE TRIGGER announcement_delivery_authorize_insert
BEFORE INSERT ON announcement_delivery
BEGIN
  SELECT CASE WHEN NEW.channel<>'in_app' OR NEW.status<>'delivered'
    OR NEW.attempted_at IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM announcement a
      JOIN staff_profile recipient ON recipient.id=NEW.recipient_ref AND recipient.account_status='active'
      WHERE a.id=NEW.announcement_id AND a.status='published' AND a.audience_type<>'public'
        AND (
          (a.audience_type='branch' AND EXISTS (
            SELECT 1 FROM staff_role_assignment ra
            JOIN role r ON r.id=ra.role_id AND r.is_active=1
            JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
            WHERE ra.staff_profile_id=recipient.id AND ra.branch_id=a.branch_id
              AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.attempted_at
              AND (ra.ends_at IS NULL OR ra.ends_at>NEW.attempted_at)
          ))
          OR (a.audience_type='staff' AND EXISTS (
            SELECT 1 FROM branch target
            JOIN branch member_branch ON member_branch.church_id=target.church_id AND member_branch.is_active=1
            JOIN staff_role_assignment ra ON ra.branch_id=member_branch.id
            JOIN role r ON r.id=ra.role_id AND r.is_active=1
            WHERE target.id=a.branch_id AND ra.staff_profile_id=recipient.id
              AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.attempted_at
              AND (ra.ends_at IS NULL OR ra.ends_at>NEW.attempted_at)
          ))
          OR (a.audience_type='team' AND EXISTS (
            SELECT 1 FROM announcement_team_audience ata
            JOIN staff_team_membership stm ON stm.team_id=ata.team_id AND stm.branch_id=ata.branch_id
            WHERE ata.announcement_id=a.id AND ata.branch_id=a.branch_id
              AND stm.staff_profile_id=recipient.id AND stm.revoked_at IS NULL
              AND stm.starts_at<=NEW.attempted_at
              AND (stm.ends_at IS NULL OR stm.ends_at>NEW.attempted_at)
          ))
          OR (a.audience_type='event' AND (
            EXISTS (
              SELECT 1 FROM announcement_event_audience aea
              JOIN event_staff_assignment esa ON esa.event_id=aea.event_id AND esa.branch_id=aea.branch_id
              WHERE aea.announcement_id=a.id AND aea.branch_id=a.branch_id
                AND esa.staff_auth_user_id=recipient.auth_user_id AND esa.revoked_at IS NULL
                AND esa.starts_at<=NEW.attempted_at
                AND (esa.ends_at IS NULL OR esa.ends_at>NEW.attempted_at)
            )
            OR EXISTS (
              SELECT 1 FROM announcement_event_audience aea
              JOIN event_team_assignment eta ON eta.event_id=aea.event_id AND eta.branch_id=aea.branch_id
              JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
              WHERE aea.announcement_id=a.id AND aea.branch_id=a.branch_id
                AND stm.staff_profile_id=recipient.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
                AND eta.starts_at<=NEW.attempted_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.attempted_at)
                AND stm.starts_at<=NEW.attempted_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.attempted_at)
            )
          ))
        )
    ) THEN RAISE(ABORT,'ANNOUNCEMENT_DELIVERY_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER announcement_read_receipt_authorize_insert
BEFORE INSERT ON announcement_read_receipt
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM announcement a
    JOIN staff_profile reader ON reader.id=NEW.staff_profile_id
      AND reader.auth_user_id=NEW.read_by AND reader.account_status='active'
    JOIN announcement_delivery d ON d.announcement_id=a.id
      AND d.recipient_ref=reader.id AND d.channel='in_app' AND d.status='delivered'
    JOIN staff_role_assignment ra ON ra.staff_profile_id=reader.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE a.id=NEW.announcement_id AND a.branch_id=NEW.branch_id AND a.status='published'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.read_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.read_at)
  ) THEN RAISE(ABORT,'ANNOUNCEMENT_READ_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER announcement_read_receipt_no_update
BEFORE UPDATE ON announcement_read_receipt
BEGIN
  SELECT RAISE(ABORT,'ANNOUNCEMENT_READ_RECEIPT_IMMUTABLE');
END;

CREATE TRIGGER announcement_read_receipt_no_delete
BEFORE DELETE ON announcement_read_receipt
BEGIN
  SELECT RAISE(ABORT,'ANNOUNCEMENT_READ_RECEIPT_IMMUTABLE');
END;

UPDATE app_meta SET schema_version=21 WHERE id=1 AND environment='non-production';
