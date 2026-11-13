-- Enforce idempotency for follow-up task creation.
CREATE UNIQUE INDEX followup_task_branch_request_id_unique
  ON followup_task(branch_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

UPDATE app_meta
SET schema_version = 11
WHERE id = 1 AND environment = 'non-production';
