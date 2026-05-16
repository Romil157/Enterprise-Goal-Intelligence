import type { GovernanceWindowSnapshot } from "./types";

export type GovernanceWindowType = "GOAL_SETTING" | "CHECK_IN";
export type GovernanceQuarter = "NONE" | "Q1" | "Q2" | "Q3" | "Q4";

const DEFAULT_WINDOW_MONTHS: Record<GovernanceQuarter, { startMonth: number; endMonthExclusive: number; yearOffset: number }> = {
  NONE: { startMonth: 4, endMonthExclusive: 5, yearOffset: 0 },
  Q1: { startMonth: 6, endMonthExclusive: 7, yearOffset: 0 },
  Q2: { startMonth: 9, endMonthExclusive: 10, yearOffset: 0 },
  Q3: { startMonth: 0, endMonthExclusive: 1, yearOffset: 1 },
  Q4: { startMonth: 2, endMonthExclusive: 4, yearOffset: 1 }
};

function getTimeZoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
    hour: Number(lookup.get("hour")),
    minute: Number(lookup.get("minute")),
    second: Number(lookup.get("second"))
  };
}

export function zonedDateTimeToUtc(year: number, month: number, day: number, timezone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const zonedParts = getTimeZoneParts(utcGuess, timezone);
  const zonedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second
  );

  return new Date(utcGuess.getTime() - (zonedAsUtc - utcGuess.getTime()));
}

export function createDefaultGovernanceWindow(input: {
  fiscalYear: number;
  type: GovernanceWindowType;
  quarter?: GovernanceQuarter;
  timezone: string;
  now?: Date;
}): GovernanceWindowSnapshot {
  const quarter = input.type === "GOAL_SETTING" ? "NONE" : input.quarter ?? "NONE";
  const windowRule = DEFAULT_WINDOW_MONTHS[quarter];
  const startYear = input.fiscalYear + windowRule.yearOffset;
  const endYear = input.fiscalYear + windowRule.yearOffset + (windowRule.endMonthExclusive > 11 ? 1 : 0);
  const endMonth = windowRule.endMonthExclusive % 12;
  const opensAt = zonedDateTimeToUtc(startYear, windowRule.startMonth, 1, input.timezone);
  const closesAt = zonedDateTimeToUtc(endYear, endMonth, 1, input.timezone);
  const now = input.now ?? new Date();

  return {
    id: null,
    type: input.type,
    quarter,
    opensAt,
    closesAt,
    locksAt: closesAt,
    status: now < opensAt ? "UPCOMING" : now >= closesAt ? "CLOSED" : "OPEN",
    source: "DEFAULT_POLICY",
    timezone: input.timezone
  };
}

export function isGovernanceWindowOpen(window: GovernanceWindowSnapshot, now = new Date()): boolean {
  return window.status === "OPEN" && now >= window.opensAt && now < window.locksAt;
}
