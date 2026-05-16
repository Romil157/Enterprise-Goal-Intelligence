import { describe, expect, it } from "vitest";
import { createAnalyticsScopeForTest } from "../scope-contracts";

describe("analytics scope contracts", () => {
  it("represents admins as organization-wide without enumerating subjects", () => {
    const scope = createAnalyticsScopeForTest("ORGANIZATION", null);

    expect(scope.subjectUserIds).toBeNull();
    expect(scope.subjectCount).toBeNull();
    expect(scope.label).toBe("Organization-wide intelligence");
  });

  it("represents manager analytics as an explicit authorized reporting chain", () => {
    const scope = createAnalyticsScopeForTest("REPORTING_CHAIN", ["user-1", "user-2"]);

    expect(scope.subjectUserIds).toEqual(["user-1", "user-2"]);
    expect(scope.subjectCount).toBe(2);
    expect(scope.label).toBe("Authorized reporting chain");
  });

  it("represents employees as personal analytics only", () => {
    const scope = createAnalyticsScopeForTest("PERSONAL", ["employee-1"]);

    expect(scope.subjectUserIds).toEqual(["employee-1"]);
    expect(scope.subjectCount).toBe(1);
    expect(scope.label).toBe("Personal KPI intelligence");
  });
});
