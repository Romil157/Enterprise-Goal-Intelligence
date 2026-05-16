# ATOMQUEST Prisma Foundation

## Architecture Decisions

The schema is designed as a multi-tenant SaaS foundation with `Organization` as the tenant boundary. Tenant-owned records include `organizationId`, and high-volume query paths use composite indexes that start with `organizationId` to support predictable filtering, dashboard workloads, and future row-level security.

Goal governance is separated into `PerformanceCycle`, `GovernanceWindow`, `GoalPlan`, `Goal`, and `CheckIn` so approval, locking, scoring, and quarterly review behavior can evolve without overloading one table. Shared KPI cascading uses `KpiDefinition`, `KpiAssignment`, `KpiSyncLog`, `Goal.isSharedMaster`, and `Goal.parentSharedGoalId`, keeping inherited targets distinct from employee-local goal weightage.

NextAuth-compatible persistence is included through `Account`, `Session`, `VerificationToken`, and `Authenticator`, while the domain `User` model remains tenant-scoped for Microsoft Entra ID integration.

## Scalability Benefits

The model avoids N+1-prone shapes by making manager, team, cycle, approval, notification, escalation, and audit lookups directly indexable. Recursive relations are explicit for reporting hierarchy, team hierarchy, goal alignment, and KPI hierarchy.

Mutable business records include `version` fields for optimistic concurrency. Business history is append-oriented through `AuditLog`, `ActivityFeed`, `KpiSyncLog`, `EscalationLog`, and notifications.

## Governance And Security

`AuditLog` is append-only and has no `updatedAt` or soft-delete field. The migration adds database triggers that block audit log updates and deletes.

Phase 3 adds an additive enterprise audit governance migration. Database triggers now create audit and activity records for goal, goal plan, approval, check-in, comment, notification, escalation, shared KPI, and hierarchy changes. `AuditLog.auditSequence` provides a global forensic ordering key, while `AuditLog.transactionId` captures the PostgreSQL transaction identifier for replay and investigation.

Application write transactions should set `app.current_user_id` with the acting user UUID. Optional transaction settings are `app.request_id`, `app.trace_id`, `app.ip_address`, `app.user_agent`, `app.system_actor`, `app.governance_bypass`, `app.kpi_sync_id`, and `app.kpi_sync_origin`. These values are captured by PostgreSQL triggers and stored in audit metadata with old/new JSONB snapshots.

Locked goals and locked or closed check-in windows are enforced in PostgreSQL before updates. Normal actors are blocked; active tenant `ADMIN` users and trusted system transactions with both `app.system_actor` and `app.governance_bypass` enabled may perform controlled corrections, which are logged as locked-record mutations and governance override activity. Rejected violations raise an exception and roll back with the transaction, so blocked attempts do not leave committed audit rows by design.

Hard deletes are blocked for governance-critical records including goals, goal plans, check-ins, comments, approvals, audit logs, activity feed entries, escalation logs, KPI definitions, KPI assignments, KPI sync logs, notifications, governance windows, and performance cycles. Use archive, cancel, resolve, lock, or soft-delete workflows instead.

Goal allocation rules are enforced with deferred PostgreSQL constraint triggers. Submitted, approved, active, and locked plans must have no more than 8 active goals, each active goal must be at least 10 percent, and active goal weightage must total exactly 100 percent.

The migrations also include row-level checks for weightage ranges, shared KPI state, percentages, non-negative overdue days, valid governance windows, assignment targets, cycle dates, JSONB GIN indexes for audit investigation, and composite indexes for audit replay, transaction correlation, activity retrieval, escalation history, and KPI synchronization history.

## Prisma Practices

Prisma models use camelCase for TypeScript ergonomics and map to snake_case PostgreSQL tables and columns. UUIDs are generated in PostgreSQL through `gen_random_uuid()`, timestamps use `TIMESTAMPTZ(6)`, and numeric performance data uses `Decimal` instead of floating-point types.

The schema validates with Prisma 6.19.3. Applying the migration requires a reachable PostgreSQL database using the `DATABASE_URL` value shown in `.env.example`.

## Phase 4 Authentication And RBAC

Phase 4 adds a minimal Next.js 15 App Router security surface around the Prisma foundation. Auth.js / NextAuth v5 is configured with Microsoft Entra ID, JWT sessions for edge middleware, and Prisma-backed user, account, session, and verification persistence through a tenant-aware ATOMQUEST adapter. The adapter preserves the existing enterprise `User` contract instead of weakening required organization fields for a generic sample schema.

Required environment variables are `AUTH_SECRET`, `AUTH_URL`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, and `AUTH_ALLOWED_TENANT_IDS`. Role mapping is driven by `ENTRA_ADMIN_GROUP_IDS`, `ENTRA_MANAGER_GROUP_IDS`, and `ENTRA_EMPLOYEE_GROUP_IDS`. Graph hierarchy sync uses app-only credentials from `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, and `GRAPH_CLIENT_SECRET`.

Browser sessions intentionally expose only minimal authorization claims: user id, organization id, role, team id, manager id, Entra object id, and tenant id. Microsoft access tokens, refresh tokens, raw Graph responses, and complete group lists are never placed in the browser session.

`middleware.ts` protects `/dashboard/*`, `/employee/*`, `/manager/*`, `/admin/*`, and `/api/protected/*` without importing Prisma or Graph clients. It makes only fast route decisions from the small JWT payload. Database-backed authorization remains server-only through `src/lib/security`, including `requireSession`, `requireRole`, `requirePermission`, tenant checks, ownership checks, and recursive manager-chain validation.

Server mutations should be wrapped with `createProtectedAction`. The wrapper loads the trusted principal from `auth()`, rejects client-submitted actor and organization identifiers, opens a Prisma transaction, and sets Phase 3 PostgreSQL audit context with `SET LOCAL app.current_user_id` before invoking the mutation handler with the transaction client.

Microsoft Graph integration under `src/server/graph` provides app-only token acquisition, retry handling for `429` and `503`, group lookup, direct-report lookup, manager lookup, and transactional organization hierarchy synchronization. Graph failures are treated as non-elevating by default: users fall back to `EMPLOYEE` unless configured groups, detected direct reports, or a trusted existing database role under Graph-unavailable conditions justify a higher role.
