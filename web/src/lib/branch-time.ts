/**
 * Branch-time utilities. datetime-local inputs represent wall-clock values
 * and must be interpreted using the selected branch's IANA time zone, not
 * the browser's local zone.
 */
export function toBranchLocalInput(
  value: string | null | undefined,
  timeZone: string,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value ?? "";
    return part("year") + "-" + part("month") + "-" + part("day") + "T" +
      part("hour") + ":" + part("minute");
  } catch {
    return "";
  }
}

/**
 * Converts a wall-clock datetime-local value to UTC. Rejects invalid IANA
 * zones, invalid calendar dates and non-existent local times at DST changes.
 * Ambiguous repeated local times resolve to the first valid matching offset.
 */
export function branchLocalInputToIso(
  value: string,
  timeZone: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) return null;

  const target = Date.UTC(year, month - 1, day, hour, minute);
  const canonical = new Date(target);
  if (
    canonical.getUTCFullYear() !== year ||
    canonical.getUTCMonth() !== month - 1 ||
    canonical.getUTCDate() !== day
  ) return null;

  let guess = target;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const parts = formatter.formatToParts(new Date(guess));
      const part = (type: string) =>
        Number(parts.find((item) => item.type === type)?.value);
      const represented = Date.UTC(
        part("year"),
        part("month") - 1,
        part("day"),
        part("hour"),
        part("minute"),
      );
      const offset = represented - guess;
      const next = target - offset;
      if (next === guess) break;
      guess = next;
    }

    const check = formatter.formatToParts(new Date(guess));
    const part = (type: string) =>
      check.find((item) => item.type === type)?.value ?? "";
    const matches = part("year") === match[1] &&
      part("month") === match[2] &&
      part("day") === match[3] &&
      part("hour") === match[4] &&
      part("minute") === match[5];
    return matches ? new Date(guess).toISOString() : null;
  } catch {
    return null;
  }
}

export function formatBranchDate(
  value: string | null,
  timeZone: string,
): string {
  if (!value) return "No end time";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return "Date unavailable";
  }
}
