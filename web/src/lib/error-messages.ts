import { AuthClientError } from "./auth";
import { CmiApiError } from "./cmi-api";

function withReference(message: string, requestId: string | null): string {
  return requestId ? `${message} (Reference: ${requestId})` : message;
}

/** Converts transport/auth/API failures into calm, actionable staff-facing copy.
 * Raw server diagnostics are intentionally never shown to end users.
 */
export function formatApplicationError(error: unknown, fallback = "We couldn't complete that action. Please try again."): string {
  if (error instanceof AuthClientError) {
    if (error.status === 0) return "We couldn't connect to the secure sign-in service. Check your internet connection and try again.";
    if (error.status === 400 || error.status === 401) return "The email address or password isn't correct. Check your details and try again.";
    if (error.status === 403) return "Your account can't complete this sign-in action. Contact an authorised church administrator.";
    if (error.status === 429) return "Too many sign-in attempts were made. Wait a few minutes before trying again.";
    if (error.status >= 500) return "The secure sign-in service is temporarily unavailable. Please try again shortly.";
    if (error.code === "INVALID_AUTH_RESPONSE") return "The sign-in service returned an unexpected response. Please try again.";
    return fallback;
  }

  if (error instanceof CmiApiError) {
    const reference = error.requestId;
    if (error.code === "IDEMPOTENCY_NOT_CONFIGURED") return withReference("This action is temporarily unavailable because a required security setting is incomplete. No changes were saved. Contact an authorised administrator.", reference);
    if (error.code === "STAFF_INVITATION_EMAIL_FAILED") return withReference("The staff account was created, but the invitation email wasn't delivered. Don't create the account again. Check the Staff list and resolve the email delivery issue before retrying.", reference);
    if (error.code === "AUTH_EMAIL_NOT_CONFIGURED") return withReference("Staff invitations are temporarily unavailable because email delivery hasn't been configured. No account was created.", reference);
    if (error.code === "STAFF_PROFILE_NOT_FOUND") return withReference("This account hasn't been set up for PCG Missions. Contact an authorised church administrator.", reference);
    if (error.code === "STAFF_ACCOUNT_NOT_ACTIVE") return withReference("This staff account is inactive. Contact an authorised church administrator.", reference);
    if (error.code === "NO_ACTIVE_BRANCH") return withReference("Your account doesn't have an active branch assignment. Contact an authorised church administrator.", reference);
    if (error.code === "PASSWORD_SETUP_EXPIRED") return withReference("Your temporary password has expired. Request a new password reset from the church administrator.", reference);
    if (error.status === 0) return withReference("We couldn't reach the PCG Missions service. Check your internet connection and try again.", reference);
    if (error.status === 401) return withReference("Your session has expired. Sign in again to continue.", reference);
    if (error.status === 403) return withReference("You don't have permission to complete this action. If you believe this is incorrect, contact an administrator.", reference);
    if (error.status === 404) return withReference("We couldn't find that record. It may have been removed or you may no longer have access to it.", reference);
    if (error.status === 409) return withReference("This record has changed or the action conflicts with its current status. Refresh the page and try again.", reference);
    if (error.status === 413) return withReference("The selected file or submitted information is too large. Choose a smaller file and try again.", reference);
    if (error.status === 415) return withReference("This file type isn't supported. Choose an approved file format and try again.", reference);
    if (error.status === 422 || error.status === 400) return withReference("Some information is missing or invalid. Review the highlighted fields and try again.", reference);
    if (error.status === 429) return withReference("There have been too many requests. Wait a moment before trying again.", reference);
    if (error.status === 503 || error.status >= 500) return withReference("This service is temporarily unavailable. Your changes may not have been saved. Refresh before retrying.", reference);
    return withReference(fallback, reference);
  }

  if (error instanceof TypeError) return "We couldn't complete the request because of a connection problem. Check your internet connection and try again.";
  return fallback;
}
