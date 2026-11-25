import application from "./index.ts";
import {
  processDueFollowupReminders,
  type ReminderEnvironment,
} from "./scheduled-followup-reminders.ts";

type ApplicationEnvironment = Parameters<typeof application.fetch>[1];

export default {
  fetch(request: Request, env: ApplicationEnvironment): Promise<Response> {
    return application.fetch(request, env);
  },

  scheduled(
    controller: ScheduledController,
    env: ApplicationEnvironment,
    context: ExecutionContext,
  ): void {
    context.waitUntil(
      processDueFollowupReminders(
        env as unknown as ReminderEnvironment,
        controller.scheduledTime,
      )
        .then((result) => {
          console.log("scheduled_followup_reminders_completed", {
            scheduled_time: new Date(controller.scheduledTime).toISOString(),
            ...result,
          });
        })
        .catch(() => {
          // Do not log task IDs, recipient IDs, notes or database error details.
          console.error("scheduled_followup_reminders_failed");
          throw new Error("SCHEDULED_FOLLOWUP_REMINDERS_FAILED");
        }),
    );
  },
};
