import type { EnterpriseRole } from "../../lib/security/roles";
import { highestRole, normalizeRole } from "../../lib/security/roles";

export interface ConfiguredRoleGroups {
  admin: ReadonlySet<string>;
  manager: ReadonlySet<string>;
  employee: ReadonlySet<string>;
}

export interface ResolveEnterpriseRoleInput {
  groupIds?: Iterable<string> | null;
  groupDataAvailable: boolean;
  hasDirectReports?: boolean;
  existingRole?: EnterpriseRole | string | null;
}

function parseGroupIdSet(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getConfiguredRoleGroups(): ConfiguredRoleGroups {
  return {
    admin: parseGroupIdSet(process.env.ENTRA_ADMIN_GROUP_IDS),
    manager: parseGroupIdSet(process.env.ENTRA_MANAGER_GROUP_IDS),
    employee: parseGroupIdSet(process.env.ENTRA_EMPLOYEE_GROUP_IDS)
  };
}

export function resolveEnterpriseRole(input: ResolveEnterpriseRoleInput): EnterpriseRole {
  const configuredGroups = getConfiguredRoleGroups();
  const matchedRoles: EnterpriseRole[] = [];

  for (const rawGroupId of input.groupIds ?? []) {
    const groupId = rawGroupId.toLowerCase();

    if (configuredGroups.admin.has(groupId)) matchedRoles.push("ADMIN");
    if (configuredGroups.manager.has(groupId)) matchedRoles.push("MANAGER_L1");
    if (configuredGroups.employee.has(groupId)) matchedRoles.push("EMPLOYEE");
  }

  if (input.hasDirectReports) {
    matchedRoles.push("MANAGER_L1");
  }

  if (matchedRoles.length > 0) {
    return highestRole(matchedRoles);
  }

  if (!input.groupDataAvailable && input.existingRole) {
    return normalizeRole(input.existingRole);
  }

  return "EMPLOYEE";
}

export function parseTenantAllowList(value: string | undefined): ReadonlySet<string> {
  return parseGroupIdSet(value);
}
