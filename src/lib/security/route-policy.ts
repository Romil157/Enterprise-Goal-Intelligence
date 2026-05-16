import { roleAtLeast, type EnterpriseRole } from "./roles";

export interface RoutePrincipal {
  id?: string;
  organizationId?: string;
  role?: EnterpriseRole;
}

export interface RouteRequirement {
  authenticated: boolean;
  minimumRole?: EnterpriseRole;
}

export interface RouteDecision {
  allowed: boolean;
  status: 200 | 401 | 403;
  reason: string;
  redirectTo?: string;
}

const ROUTE_REQUIREMENTS: Array<[RegExp, RouteRequirement]> = [
  [/^\/admin(?:\/.*)?$/, { authenticated: true, minimumRole: "ADMIN" }],
  [/^\/manager(?:\/.*)?$/, { authenticated: true, minimumRole: "MANAGER_L1" }],
  [/^\/employee(?:\/.*)?$/, { authenticated: true, minimumRole: "EMPLOYEE" }],
  [/^\/dashboard(?:\/.*)?$/, { authenticated: true, minimumRole: "EMPLOYEE" }],
  [/^\/api\/protected\/admin(?:\/.*)?$/, { authenticated: true, minimumRole: "ADMIN" }],
  [/^\/api\/protected\/manager(?:\/.*)?$/, { authenticated: true, minimumRole: "MANAGER_L1" }],
  [/^\/api\/protected(?:\/.*)?$/, { authenticated: true, minimumRole: "EMPLOYEE" }]
];

export function getRouteRequirement(pathname: string): RouteRequirement {
  for (const [pattern, requirement] of ROUTE_REQUIREMENTS) {
    if (pattern.test(pathname)) return requirement;
  }

  return { authenticated: false };
}

export function isProtectedApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/protected");
}

export function authorizeRoute(pathname: string, principal: RoutePrincipal | null | undefined): RouteDecision {
  const requirement = getRouteRequirement(pathname);

  if (!requirement.authenticated) {
    return { allowed: true, status: 200, reason: "PUBLIC_ROUTE" };
  }

  if (!principal?.id || !principal.organizationId || !principal.role) {
    return {
      allowed: false,
      status: 401,
      reason: "AUTHENTICATION_REQUIRED",
      redirectTo: `/sign-in?callbackUrl=${encodeURIComponent(pathname)}`
    };
  }

  if (requirement.minimumRole && !roleAtLeast(principal.role, requirement.minimumRole)) {
    return {
      allowed: false,
      status: 403,
      reason: "INSUFFICIENT_ROLE",
      redirectTo: "/unauthorized"
    };
  }

  return { allowed: true, status: 200, reason: "AUTHORIZED" };
}
