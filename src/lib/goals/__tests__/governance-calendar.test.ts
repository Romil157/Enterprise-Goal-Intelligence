import { describe, expect, it } from "vitest";
import { createDefaultGovernanceWindow, isGovernanceWindowOpen } from "../governance-calendar";

describe("default governance calendar", () => {
  it("uses full May for goal setting by default", () => {
    const window = createDefaultGovernanceWindow({
      fiscalYear: 2026,
      type: "GOAL_SETTING",
      timezone: "UTC",
      now: new Date("2026-05-16T00:00:00.000Z")
    });

    expect(window.opensAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(window.closesAt.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(window.status).toBe("OPEN");
    expect(isGovernanceWindowOpen(window, new Date("2026-05-16T00:00:00.000Z"))).toBe(true);
  });

  it("uses March through April for Q4 review", () => {
    const window = createDefaultGovernanceWindow({
      fiscalYear: 2026,
      type: "CHECK_IN",
      quarter: "Q4",
      timezone: "UTC",
      now: new Date("2027-04-15T00:00:00.000Z")
    });

    expect(window.opensAt.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(window.closesAt.toISOString()).toBe("2027-05-01T00:00:00.000Z");
    expect(window.status).toBe("OPEN");
  });
});
