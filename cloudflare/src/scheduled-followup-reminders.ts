export interface ReminderPreparedStatement {
  bind(...values: unknown[]): ReminderPreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface ReminderDatabase {
  prepare(query: string): ReminderPreparedStatement;
  batch(statements: ReminderPreparedStatement[]): Promise<Array<{ success: boolean; meta?: { changes?: number } }>>;
}

export interface ReminderEnvironment {
  DB: ReminderDatabase;
}

interface DueFollowupTask {
  id: string;
  branch_id: string;
  assignee_user_id: string;
  due_at: string;
}

const MAX_TASKS_PER_INVOCATION = 50;

/**
 * Create one private in-app reminder for each currently assigned, due follow-up.
 *
 * The notification idempotency key includes the task, exact due instant and
 * current assignee. Rescheduling or reassigning a task therefore creates a new
 * reminder identity, while overlapping Cron invocations cannot duplicate the
 * same reminder. No contact data or task notes are copied into the inbox.
 */
export async function processDueFollowupReminders(
  env: ReminderEnvironment,
  scheduledAt: number,
): Promise<{ due_tasks_found: number; notifications_created: number }> {
  if (!Number.isFinite(scheduledAt) || scheduledAt <= 0) {
    throw new Error("SCHEDULED_TIME_INVALID");
  }

  const now = new Date(scheduledAt).toISOString();
  const due = await env.DB.prepare(`
    SELECT ft.id, ft.branch_id, ft.assignee_user_id, ft.due_at
    FROM followup_task ft
    JOIN staff_profile sp
      ON sp.auth_user_id = ft.assignee_user_id
      AND sp.account_status = 'active'
      AND sp.deactivated_at IS NULL
    WHERE ft.status IN ('open', 'in_progress')
      AND ft.due_at IS NOT NULL
      AND datetime(ft.due_at) <= datetime(?)
      AND EXISTS (
        SELECT 1
        FROM staff_role_assignment a
        JOIN role r ON r.id = a.role_id AND r.is_active = 1
        WHERE a.staff_profile_id = sp.id
          AND a.branch_id = ft.branch_id
          AND a.revoked_at IS NULL
          AND datetime(a.starts_at) <= datetime(?)
          AND (a.ends_at IS NULL OR datetime(a.ends_at) > datetime(?))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM staff_notification n
        WHERE n.idempotency_key =
          'followup-due:' || ft.id || ':' || ft.due_at || ':' || ft.assignee_user_id
      )
    ORDER BY datetime(ft.due_at) ASC, ft.id ASC
    LIMIT ${MAX_TASKS_PER_INVOCATION}
  `).bind(now, now, now).all<DueFollowupTask>();

  const tasks = due.results ?? [];
  if (tasks.length === 0) {
    return { due_tasks_found: 0, notifications_created: 0 };
  }

  const statements = tasks.map((task) => {
    const idempotencyKey = `followup-due:${task.id}:${task.due_at}:${task.assignee_user_id}`;
    return env.DB.prepare(`
      INSERT OR IGNORE INTO staff_notification
        (id, branch_id, recipient_user_id, category, title, body,
         target_type, target_id, idempotency_key, created_at)
      SELECT ?, ?, ?, 'system', 'Follow-up due',
             'A follow-up task is due. Open Follow-up to review it.',
             'followup_task', ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM followup_task ft
        JOIN staff_profile sp
          ON sp.auth_user_id = ft.assignee_user_id
          AND sp.account_status = 'active'
          AND sp.deactivated_at IS NULL
        WHERE ft.id = ?
          AND ft.branch_id = ?
          AND ft.assignee_user_id = ?
          AND ft.due_at = ?
          AND ft.status IN ('open', 'in_progress')
          AND EXISTS (
            SELECT 1
            FROM staff_role_assignment a
            JOIN role r ON r.id = a.role_id AND r.is_active = 1
            WHERE a.staff_profile_id = sp.id
              AND a.branch_id = ft.branch_id
              AND a.revoked_at IS NULL
              AND datetime(a.starts_at) <= datetime(?)
              AND (a.ends_at IS NULL OR datetime(a.ends_at) > datetime(?))
          )
      )
    `).bind(
      crypto.randomUUID(),
      task.branch_id,
      task.assignee_user_id,
      task.id,
      idempotencyKey,
      now,
      task.id,
      task.branch_id,
      task.assignee_user_id,
      task.due_at,
      now,
      now,
    );
  });

  const results = await env.DB.batch(statements);
  if (results.length !== statements.length || results.some((result) => !result.success)) {
    throw new Error("SCHEDULED_FOLLOWUP_NOTIFICATION_BATCH_FAILED");
  }

  return {
    due_tasks_found: tasks.length,
    notifications_created: results.reduce((count, result) => count + (result.meta?.changes ?? 0), 0),
  };
}
