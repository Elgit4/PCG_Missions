export function manualCredentialHandoff(
  emailSent: boolean,
  temporaryPassword: string,
): Record<string, unknown> {
  return emailSent
    ? {}
    : {
      manual_handoff_required: true,
      temporary_password: temporaryPassword,
    };
}

export function canSendPasswordResetNotification(config: {
  apiKey: string;
  from: string;
  appUrl: string;
  recipients: string[];
}): boolean {
  return !!config.apiKey.trim() &&
    !!config.from.trim() &&
    config.appUrl.startsWith("https://") &&
    config.recipients.length > 0;
}
