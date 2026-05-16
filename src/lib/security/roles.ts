export type EnterpriseRole = "EMPLOYEE" | "MANAGER_L1" | "ADMIN";

export const ROLE_ORDER: Record<EnterpriseRole, number> = {
  EMPLOYEE: 10,
  MANAGER_L1: 20,
  ADMIN: 30
};

export function isEnterpriseRole(value: unknown): value is EnterpriseRole {
  return value === "EMPLOYEE" || value === "MANAGER_L1" || value === "ADMIN";
}

export function normalizeRole(value: unknown): EnterpriseRole {
  return isEnterpriseRole(value) ? value : "EMPLOYEE";
}

export function roleAtLeast(actual: EnterpriseRole | undefined, required: EnterpriseRole): boolean {
  if (!actual) return false;
  return ROLE_ORDER[actual] >= ROLE_ORDER[required];
}

export function highestRole(roles: Iterable<EnterpriseRole>): EnterpriseRole {
  let selected: EnterpriseRole = "EMPLOYEE";

  for (const role of roles) {
    if (roleAtLeast(role, selected)) selected = role;
  }

  return selected;
}
