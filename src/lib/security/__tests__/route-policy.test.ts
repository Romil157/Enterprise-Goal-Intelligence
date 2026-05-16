import { describe, expect, it } from "vitest";
import { authorizeRoute } from "../route-policy";
import { hasPermission } from "../permissions";
import { roleAtLeast } from "../roles";

describe("route policy", () => {
  it("denies protected routes without a principal", () => {
    const decision = authorizeRoute("/admin/audit", null);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(401);
  });

  it("denies manager routes to employees", () => {
    const decision = authorizeRoute("/manager/reviews", {
      id: "u1",
      organizationId: "o1",
      role: "EMPLOYEE"
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(403);
  });

  it("allows admin routes to admins", () => {
    const decision = authorizeRoute("/admin/governance", {
      id: "u1",
      organizationId: "o1",
      role: "ADMIN"
    });
    expect(decision.allowed).toBe(true);
  });
});

describe("rbac primitives", () => {
  it("orders roles conservatively", () => {
    expect(roleAtLeast("ADMIN", "MANAGER_L1")).toBe(true);
    expect(roleAtLeast("EMPLOYEE", "MANAGER_L1")).toBe(false);
  });

  it("keeps audit permissions admin-only", () => {
    expect(hasPermission("ADMIN", "audit:read")).toBe(true);
    expect(hasPermission("MANAGER_L1", "audit:read")).toBe(false);
  });
});
