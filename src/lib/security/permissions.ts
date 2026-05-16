import type { EnterpriseRole } from "./roles";

export type Permission =
  | "goal:read:self"
  | "goal:write:self"
  | "check-in:submit:self"
  | "report:read:self"
  | "report:read:subordinate"
  | "goal:review:subordinate"
  | "approval:decide:subordinate"
  | "team:workflow:manage"
  | "organization:read"
  | "governance:manage"
  | "escalation:manage"
  | "audit:read"
  | "report:export"
  | "admin:manage";

export const ROLE_PERMISSIONS: Record<EnterpriseRole, ReadonlySet<Permission>> = {
  EMPLOYEE: new Set([
    "goal:read:self",
    "goal:write:self",
    "check-in:submit:self",
    "report:read:self"
  ]),
  MANAGER_L1: new Set([
    "goal:read:self",
    "goal:write:self",
    "check-in:submit:self",
    "report:read:self",
    "report:read:subordinate",
    "goal:review:subordinate",
    "approval:decide:subordinate",
    "team:workflow:manage"
  ]),
  ADMIN: new Set([
    "goal:read:self",
    "goal:write:self",
    "check-in:submit:self",
    "report:read:self",
    "report:read:subordinate",
    "goal:review:subordinate",
    "approval:decide:subordinate",
    "team:workflow:manage",
    "organization:read",
    "governance:manage",
    "escalation:manage",
    "audit:read",
    "report:export",
    "admin:manage"
  ])
};

export function hasPermission(role: EnterpriseRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}
