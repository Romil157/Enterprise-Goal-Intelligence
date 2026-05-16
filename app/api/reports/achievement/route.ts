import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { requireSession } from "@/src/lib/security/session";
import { hasPermission } from "@/src/lib/security/permissions";

/**
 * GET /api/reports/achievement
 *
 * Export achievement report as CSV.
 * Query params:
 *   - quarter: Q1 | Q2 | Q3 | Q4 (optional, defaults to all)
 *   - cycleId: UUID (optional, defaults to active cycle)
 */
export async function GET(request: NextRequest) {
  const principal = await requireSession();

  if (!hasPermission(principal.role, "report:read:subordinate") && !hasPermission(principal.role, "report:export")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const quarterFilter = searchParams.get("quarter");
  const cycleIdParam = searchParams.get("cycleId");

  // Resolve cycle
  let cycleId = cycleIdParam;
  if (!cycleId) {
    const activeCycle = await prisma.performanceCycle.findFirst({
      where: {
        organizationId: principal.organizationId,
        status: { in: ["ACTIVE", "DRAFT"] }
      },
      orderBy: [{ status: "asc" }, { fiscalYear: "desc" }],
      select: { id: true }
    });
    cycleId = activeCycle?.id ?? null;
  }

  if (!cycleId) {
    return NextResponse.json({ error: "No active performance cycle found." }, { status: 404 });
  }

  // Scope filter for managers vs admins
  const subordinateFilter =
    principal.role === "ADMIN"
      ? {}
      : { ownerId: { in: await getSubordinateIds(principal) } };

  // Query goals with check-ins
  const goals = await prisma.goal.findMany({
    where: {
      organizationId: principal.organizationId,
      cycleId,
      status: { notIn: ["CANCELLED", "ARCHIVED"] },
      ...subordinateFilter
    },
    orderBy: [{ owner: { displayName: "asc" } }, { weightage: "desc" }],
    select: {
      title: true,
      scoringMethod: true,
      uomType: true,
      weightage: true,
      targetValue: true,
      currentValue: true,
      progressPercent: true,
      unit: true,
      dueDate: true,
      owner: { select: { displayName: true, email: true, department: true } },
      checkIns: {
        where: quarterFilter ? { quarter: quarterFilter as any } : {},
        select: {
          quarter: true,
          actualAchievement: true,
          progressScore: true,
          progressStatus: true,
          status: true,
          submittedAt: true,
          managerComment: true
        }
      }
    }
  });

  // Build CSV
  const headers = [
    "Employee",
    "Email",
    "Department",
    "Goal",
    "Scoring Method",
    "Weight (%)",
    "Target",
    "Unit",
    "Due Date",
    "Quarter",
    "Actual Achievement",
    "Progress Score (%)",
    "Progress Status",
    "Check-In Status",
    "Submitted At",
    "Manager Comment"
  ];

  const rows: string[][] = [];

  for (const goal of goals) {
    const target = goal.targetValue ? Number(goal.targetValue) : "";
    const dueDate = goal.dueDate ? goal.dueDate.toISOString().split("T")[0] : "";

    if (goal.checkIns.length === 0) {
      rows.push([
        goal.owner.displayName,
        goal.owner.email,
        goal.owner.department ?? "",
        goal.title,
        goal.scoringMethod,
        String(Number(goal.weightage)),
        String(target),
        goal.unit ?? "",
        dueDate,
        "",
        "",
        String(Number(goal.progressPercent)),
        "",
        "No check-in",
        "",
        ""
      ]);
    } else {
      for (const ci of goal.checkIns) {
        rows.push([
          goal.owner.displayName,
          goal.owner.email,
          goal.owner.department ?? "",
          goal.title,
          goal.scoringMethod,
          String(Number(goal.weightage)),
          String(target),
          goal.unit ?? "",
          dueDate,
          ci.quarter,
          ci.actualAchievement ? String(Number(ci.actualAchievement)) : "",
          String(Number(ci.progressScore)),
          ci.progressStatus,
          ci.status,
          ci.submittedAt ? ci.submittedAt.toISOString().split("T")[0] : "",
          (ci.managerComment ?? "").replace(/"/g, '""')
        ]);
      }
    }
  }

  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(","))
  ].join("\r\n");

  const filename = `achievement_report_${quarterFilter ?? "all"}_${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}

function escapeCSV(value: string): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function getSubordinateIds(principal: { userId: string; organizationId: string }): Promise<string[]> {
  const subordinates = await prisma.user.findMany({
    where: {
      organizationId: principal.organizationId,
      managerId: principal.userId,
      status: "ACTIVE",
      isActive: true,
      deletedAt: null
    },
    select: { id: true }
  });
  return subordinates.map((u) => u.id);
}
