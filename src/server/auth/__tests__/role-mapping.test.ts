import { afterEach, describe, expect, it } from "vitest";
import { resolveEnterpriseRole } from "../role-mapping";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env.ENTRA_ADMIN_GROUP_IDS = originalEnv.ENTRA_ADMIN_GROUP_IDS;
  process.env.ENTRA_MANAGER_GROUP_IDS = originalEnv.ENTRA_MANAGER_GROUP_IDS;
  process.env.ENTRA_EMPLOYEE_GROUP_IDS = originalEnv.ENTRA_EMPLOYEE_GROUP_IDS;
});

describe("enterprise role mapping", () => {
  it("maps configured admin group membership to ADMIN", () => {
    process.env.ENTRA_ADMIN_GROUP_IDS = "admin-group";
    process.env.ENTRA_MANAGER_GROUP_IDS = "manager-group";

    expect(
      resolveEnterpriseRole({
        groupIds: ["manager-group", "admin-group"],
        groupDataAvailable: true
      })
    ).toBe("ADMIN");
  });

  it("maps configured manager group membership to MANAGER_L1", () => {
    process.env.ENTRA_MANAGER_GROUP_IDS = "manager-group";

    expect(
      resolveEnterpriseRole({
        groupIds: ["manager-group"],
        groupDataAvailable: true
      })
    ).toBe("MANAGER_L1");
  });

  it("does not elevate from database fallback when group data is available", () => {
    process.env.ENTRA_ADMIN_GROUP_IDS = "admin-group";

    expect(
      resolveEnterpriseRole({
        groupIds: [],
        groupDataAvailable: true,
        existingRole: "ADMIN"
      })
    ).toBe("EMPLOYEE");
  });

  it("uses existing role only when Graph group data is unavailable", () => {
    expect(
      resolveEnterpriseRole({
        groupIds: [],
        groupDataAvailable: false,
        existingRole: "MANAGER_L1"
      })
    ).toBe("MANAGER_L1");
  });

  it("promotes users with direct reports to MANAGER_L1", () => {
    expect(
      resolveEnterpriseRole({
        groupIds: [],
        groupDataAvailable: true,
        hasDirectReports: true
      })
    ).toBe("MANAGER_L1");
  });
});
