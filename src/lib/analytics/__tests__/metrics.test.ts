import { describe, expect, it } from "vitest";
import {
  buildQoQSeries,
  calculateDelta,
  calculateProductivityScore,
  classifySeverity,
  createPerformanceHeatmap,
  rankDepartmentBenchmarks,
  safePercent
} from "../metrics";

describe("analytics metrics", () => {
  it("calculates safe percentages without leaking NaN", () => {
    expect(safePercent(5, 10)).toBe(50);
    expect(safePercent(1, 3)).toBe(33.3);
    expect(safePercent(2, 0)).toBe(0);
  });

  it("labels trend deltas", () => {
    expect(calculateDelta(76, 70, "QoQ").direction).toBe("up");
    expect(calculateDelta(60, 75, "QoQ").direction).toBe("down");
    expect(calculateDelta(60, 60, "QoQ").direction).toBe("flat");
  });

  it("scores department productivity with escalation and return penalties", () => {
    const healthy = calculateProductivityScore({
      averageProgress: 82,
      approvedPlans: 10,
      submittedPlans: 1,
      returnedPlans: 0,
      openEscalations: 0,
      employeeCount: 12
    });
    const risky = calculateProductivityScore({
      averageProgress: 50,
      approvedPlans: 2,
      submittedPlans: 4,
      returnedPlans: 3,
      openEscalations: 4,
      employeeCount: 12
    });

    expect(healthy).toBeGreaterThan(risky);
  });

  it("ranks department benchmarks for executive scanability", () => {
    const ranked = rankDepartmentBenchmarks([
      {
        department: "Ops",
        productivityScore: 71,
        goalCount: 10,
        employeeCount: 2,
        averageProgress: 70,
        approvedPlans: 1,
        submittedPlans: 1,
        returnedPlans: 0,
        openEscalations: 0,
        approvalTurnaroundHours: 24,
        checkInComplianceRate: 75,
        severity: "info"
      },
      {
        department: "Sales",
        productivityScore: 91,
        goalCount: 8,
        employeeCount: 2,
        averageProgress: 90,
        approvedPlans: 2,
        submittedPlans: 0,
        returnedPlans: 0,
        openEscalations: 0,
        approvalTurnaroundHours: 12,
        checkInComplianceRate: 90,
        severity: "info"
      }
    ]);

    expect(ranked[0].department).toBe("Sales");
  });

  it("classifies inverse and direct operational severity thresholds", () => {
    expect(classifySeverity(80, { warning: 60, critical: 40, inverse: true })).toBe("info");
    expect(classifySeverity(50, { warning: 60, critical: 40, inverse: true })).toBe("warning");
    expect(classifySeverity(6, { warning: 1, critical: 5 })).toBe("critical");
  });

  it("builds complete QoQ series with empty-safe numeric defaults", () => {
    const series = buildQoQSeries([{ quarter: "Q1", progress: 0, approvals: 0, escalations: 0, compliance: 0 }]);

    expect(series[0]).toMatchObject({
      label: "Q1",
      approvalTurnaroundHours: 0,
      openEscalations: 0
    });
  });

  it("creates heatmap cells from department benchmarks", () => {
    const heatmap = createPerformanceHeatmap([
      {
        department: "Ops",
        productivityScore: 35,
        goalCount: 4,
        employeeCount: 3,
        averageProgress: 42,
        approvedPlans: 1,
        submittedPlans: 2,
        returnedPlans: 1,
        openEscalations: 5,
        approvalTurnaroundHours: 80,
        checkInComplianceRate: 48,
        severity: "critical"
      }
    ]);

    expect(heatmap[0].cells.some((cell) => cell.severity === "critical")).toBe(true);
  });
});
