export interface NotificationStaffProfile {
  account_status: string;
  must_change_password: boolean;
}

export type NotificationProfileDenial =
  | "not_active"
  | "password_change_required";

export function notificationProfileDenial(
  profile: NotificationStaffProfile | null,
): NotificationProfileDenial | null {
  if (!profile || profile.account_status !== "active") {
    return "not_active";
  }
  if (profile.must_change_password) {
    return "password_change_required";
  }
  return null;
}

export interface NotificationRecipientScope {
  recipient_user_id: string;
  branch_id: string;
}

export function notificationRecipientScope(
  actorId: string,
  branchId: string,
): NotificationRecipientScope {
  return {
    recipient_user_id: actorId,
    branch_id: branchId,
  };
}

export function notificationPageLimit(value: string | null): number {
  const parsed = Number(value ?? "30");
  return Number.isInteger(parsed) ? Math.max(1, Math.min(50, parsed)) : 30;
}
