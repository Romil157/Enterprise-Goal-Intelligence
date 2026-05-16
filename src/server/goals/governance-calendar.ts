import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createDefaultGovernanceWindow,
  isGovernanceWindowOpen,
  type GovernanceQuarter,
  type GovernanceWindowType
} from "@/src/lib/goals/governance-calendar";
import type { GovernanceWindowSnapshot } from "@/src/lib/goals/types";
import { GoalValidationError, GovernanceLockError } from "./errors";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTimezone(timezone: unknown): string | null {
  if (typeof timezone !== "string" || timezone.trim().length === 0) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}

export async function resolveOrganizationTimezone(
  db: DatabaseClient,
  organizationId: string,
  fallbackUserId?: string | null
): Promise<string> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true }
  });

  const organizationTimezone = isRecord(organization?.settings) ? normalizeTimezone(organization.settings.timezone) : null;
  if (organizationTimezone) return organizationTimezone;

  if (fallbackUserId) {
    const user = await db.user.findUnique({
      where: { id: fallbackUserId },
      select: { timezone: true }
    });
    const userTimezone = normalizeTimezone(user?.timezone);
    if (userTimezone) return userTimezone;
  }

  return "UTC";
}

export async function getActivePerformanceCycle(db: DatabaseClient, organizationId: string) {
  return db.performanceCycle.findFirst({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "DRAFT"] }
    },
    orderBy: [{ status: "asc" }, { fiscalYear: "desc" }],
    select: {
      id: true,
      organizationId: true,
      fiscalYear: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      version: true
    }
  });
}

export async function resolveGovernanceWindow(
  db: DatabaseClient,
  input: {
    organizationId: string;
    cycleId: string;
    type: GovernanceWindowType;
    quarter?: GovernanceQuarter;
    fallbackUserId?: string | null;
    now?: Date;
  }
): Promise<GovernanceWindowSnapshot> {
  const now = input.now ?? new Date();
  const quarter = input.type === "GOAL_SETTING" ? "NONE" : input.quarter ?? "NONE";
  const [cycle, dbWindow, timezone] = await Promise.all([
    db.performanceCycle.findUnique({
      where: { id: input.cycleId },
      select: { fiscalYear: true, organizationId: true }
    }),
    db.governanceWindow.findFirst({
      where: {
        organizationId: input.organizationId,
        cycleId: input.cycleId,
        type: input.type,
        quarter
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        quarter: true,
        status: true,
        opensAt: true,
        closesAt: true,
        locksAt: true
      }
    }),
    resolveOrganizationTimezone(db, input.organizationId, input.fallbackUserId)
  ]);

  if (!cycle || cycle.organizationId !== input.organizationId) {
    throw new GoalValidationError("CYCLE_NOT_FOUND", "The selected performance cycle is not active in this organization.");
  }

  if (dbWindow) {
    return {
      id: dbWindow.id,
      type: dbWindow.type,
      quarter: dbWindow.quarter,
      status: dbWindow.status,
      opensAt: dbWindow.opensAt,
      closesAt: dbWindow.closesAt,
      locksAt: dbWindow.locksAt,
      source: "DATABASE",
      timezone
    };
  }

  return createDefaultGovernanceWindow({
    fiscalYear: cycle.fiscalYear,
    type: input.type,
    quarter,
    timezone,
    now
  });
}

export async function assertGoalSettingWindowOpen(
  db: DatabaseClient,
  input: {
    organizationId: string;
    cycleId: string;
    fallbackUserId?: string | null;
    now?: Date;
    allowAdminOverride?: boolean;
    actorRole?: string;
  }
): Promise<GovernanceWindowSnapshot> {
  const window = await resolveGovernanceWindow(db, {
    organizationId: input.organizationId,
    cycleId: input.cycleId,
    type: "GOAL_SETTING",
    fallbackUserId: input.fallbackUserId,
    now: input.now
  });

  if (!isGovernanceWindowOpen(window, input.now ?? new Date())) {
    if (input.allowAdminOverride && input.actorRole === "ADMIN") return window;
    throw new GovernanceLockError(
      `Goal-setting changes are locked. Active default policy window is May; this cycle window is ${window.status.toLowerCase()}.`
    );
  }

  return window;
}
