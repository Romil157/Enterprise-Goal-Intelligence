CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'MANAGER_L1', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "TeamType" AS ENUM ('COMPANY', 'DEPARTMENT', 'FUNCTION', 'SQUAD', 'PROJECT');
CREATE TYPE "TeamMembershipRole" AS ENUM ('MEMBER', 'LEAD', 'MANAGER', 'EXECUTIVE');
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'LOCKED', 'ARCHIVED');
CREATE TYPE "GovernanceWindowType" AS ENUM ('GOAL_SETTING', 'CHECK_IN');
CREATE TYPE "GovernanceWindowStatus" AS ENUM ('UPCOMING', 'OPEN', 'LOCKED', 'CLOSED');
CREATE TYPE "Quarter" AS ENUM ('NONE', 'Q1', 'Q2', 'Q3', 'Q4');
CREATE TYPE "GoalPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'ACTIVE', 'REWORK_REQUESTED', 'LOCKED', 'ARCHIVED');
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED', 'LOCKED', 'ARCHIVED');
CREATE TYPE "GoalPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "GoalSource" AS ENUM ('MANUAL', 'SHARED_KPI', 'IMPORTED', 'SYSTEM');
CREATE TYPE "GoalVisibility" AS ENUM ('PRIVATE', 'MANAGER', 'TEAM', 'ORGANIZATION');
CREATE TYPE "GoalKpiRole" AS ENUM ('LOCAL', 'MASTER', 'REPLICA');
CREATE TYPE "UomType" AS ENUM ('NUMBER', 'PERCENTAGE', 'CURRENCY', 'DAYS', 'HOURS', 'BOOLEAN', 'COUNT', 'RATIO');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REWORK_REQUESTED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REQUEST_REWORK', 'REJECT', 'CANCEL');
CREATE TYPE "ScoringMethod" AS ENUM ('NUMERIC_MIN', 'NUMERIC_MAX', 'PERCENTAGE_MIN', 'PERCENTAGE_MAX', 'TIMELINE', 'ZERO_BASED');
CREATE TYPE "CheckInStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REWORK_REQUESTED', 'LOCKED');
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'COMPLETED', 'BLOCKED');
CREATE TYPE "NotificationType" AS ENUM ('GOAL_DUE', 'CHECK_IN_DUE', 'APPROVAL_REQUEST', 'APPROVAL_DECISION', 'ESCALATION', 'KPI_SYNC', 'COMMENT', 'TEAMS_ADAPTIVE_CARD', 'WORKFLOW_ACTION', 'SYSTEM');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "EscalationLevel" AS ENUM ('MANAGER', 'HR', 'ADMIN');
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOCKED_UPDATE', 'SUBMIT', 'APPROVE', 'REJECT', 'REQUEST_REWORK', 'SYNC', 'ESCALATE', 'SYSTEM');
CREATE TYPE "ActivityType" AS ENUM ('GOAL_CREATED', 'GOAL_UPDATED', 'GOAL_SUBMITTED', 'GOAL_APPROVED', 'GOAL_REJECTED', 'GOAL_LOCKED', 'CHECK_IN_SUBMITTED', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'APPROVAL_REWORK_REQUESTED', 'KPI_SYNCED', 'ESCALATION_CREATED', 'COMMENT_ADDED', 'NOTIFICATION_SENT', 'HIERARCHY_CHANGED', 'TEAM_UPDATED', 'TEAMS_CARD_SENT', 'TEAMS_ACTION_RECEIVED');
CREATE TYPE "KpiStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "KpiSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'SKIPPED', 'FAILED');

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "primary_domain" VARCHAR(255),
  "entra_tenant_id" VARCHAR(128),
  "settings" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizations_slug_key" UNIQUE ("slug"),
  CONSTRAINT "organizations_entra_tenant_id_key" UNIQUE ("entra_tenant_id"),
  CONSTRAINT "organizations_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "manager_id" UUID,
  "team_id" UUID,
  "email" VARCHAR(320) NOT NULL,
  "email_normalized" VARCHAR(320) NOT NULL,
  "email_verified" TIMESTAMPTZ(6),
  "name" VARCHAR(160),
  "display_name" VARCHAR(160) NOT NULL,
  "avatar_url" TEXT,
  "employee_code" VARCHAR(64),
  "entra_object_id" VARCHAR(128),
  "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
  "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
  "designation" VARCHAR(160),
  "department" VARCHAR(160),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "locale" VARCHAR(32) NOT NULL DEFAULT 'en-US',
  "last_login_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_org_email_normalized_key" UNIQUE ("organization_id", "email_normalized"),
  CONSTRAINT "users_org_employee_code_key" UNIQUE ("organization_id", "employee_code"),
  CONSTRAINT "users_org_entra_object_id_key" UNIQUE ("organization_id", "entra_object_id"),
  CONSTRAINT "users_version_check" CHECK ("version" >= 1),
  CONSTRAINT "users_email_normalized_check" CHECK ("email_normalized" = lower("email_normalized"))
);

CREATE TABLE "accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(64) NOT NULL,
  "provider_account_id" VARCHAR(191) NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" VARCHAR(64),
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" VARCHAR(255),
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounts_provider_provider_account_id_key" UNIQUE ("provider", "provider_account_id")
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_token" VARCHAR(255) NOT NULL,
  "user_id" UUID NOT NULL,
  "expires" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_session_token_key" UNIQUE ("session_token")
);

CREATE TABLE "verification_tokens" (
  "identifier" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "expires" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "verification_tokens_token_key" UNIQUE ("token"),
  CONSTRAINT "verification_tokens_identifier_token_key" UNIQUE ("identifier", "token")
);

CREATE TABLE "authenticators" (
  "credential_id" VARCHAR(255) NOT NULL,
  "user_id" UUID NOT NULL,
  "provider_account_id" VARCHAR(191) NOT NULL,
  "credential_public_key" TEXT NOT NULL,
  "counter" INTEGER NOT NULL,
  "credential_device_type" VARCHAR(64) NOT NULL,
  "credential_backed_up" BOOLEAN NOT NULL,
  "transports" TEXT,
  CONSTRAINT "authenticators_pkey" PRIMARY KEY ("user_id", "credential_id"),
  CONSTRAINT "authenticators_credential_id_key" UNIQUE ("credential_id"),
  CONSTRAINT "authenticators_counter_check" CHECK ("counter" >= 0)
);

CREATE TABLE "teams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "parent_team_id" UUID,
  "manager_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "department_code" VARCHAR(64) NOT NULL,
  "type" "TeamType" NOT NULL DEFAULT 'DEPARTMENT',
  "description" TEXT,
  "path" TEXT NOT NULL DEFAULT '/',
  "depth" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teams_org_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "teams_org_department_code_key" UNIQUE ("organization_id", "department_code"),
  CONSTRAINT "teams_depth_check" CHECK ("depth" >= 0),
  CONSTRAINT "teams_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "team_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "TeamMembershipRole" NOT NULL DEFAULT 'MEMBER',
  "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(6),
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_memberships_dates_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE TABLE "performance_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "fiscal_year" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "performance_cycles_org_fiscal_year_key" UNIQUE ("organization_id", "fiscal_year"),
  CONSTRAINT "performance_cycles_dates_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "performance_cycles_fiscal_year_check" CHECK ("fiscal_year" BETWEEN 2000 AND 2100),
  CONSTRAINT "performance_cycles_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "governance_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "cycle_id" UUID NOT NULL,
  "type" "GovernanceWindowType" NOT NULL,
  "quarter" "Quarter" NOT NULL DEFAULT 'NONE',
  "status" "GovernanceWindowStatus" NOT NULL DEFAULT 'UPCOMING',
  "name" VARCHAR(160) NOT NULL,
  "opens_at" TIMESTAMPTZ(6) NOT NULL,
  "closes_at" TIMESTAMPTZ(6) NOT NULL,
  "locks_at" TIMESTAMPTZ(6) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "governance_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governance_windows_cycle_type_quarter_key" UNIQUE ("cycle_id", "type", "quarter"),
  CONSTRAINT "governance_windows_dates_check" CHECK ("opens_at" < "closes_at" AND "closes_at" <= "locks_at"),
  CONSTRAINT "governance_windows_quarter_type_check" CHECK (("type" = 'GOAL_SETTING' AND "quarter" = 'NONE') OR ("type" = 'CHECK_IN' AND "quarter" <> 'NONE')),
  CONSTRAINT "governance_windows_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "goal_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "cycle_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "team_id" UUID,
  "submitted_by_id" UUID,
  "approved_by_id" UUID,
  "status" "GoalPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "total_weight" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "submitted_at" TIMESTAMPTZ(6),
  "approved_at" TIMESTAMPTZ(6),
  "locked_at" TIMESTAMPTZ(6),
  "rework_reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "goal_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_plans_org_owner_cycle_key" UNIQUE ("organization_id", "owner_id", "cycle_id"),
  CONSTRAINT "goal_plans_total_weight_check" CHECK ("total_weight" >= 0 AND "total_weight" <= 100),
  CONSTRAINT "goal_plans_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "goals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "cycle_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "team_id" UUID,
  "parent_goal_id" UUID,
  "parent_shared_goal_id" UUID,
  "kpi_definition_id" UUID,
  "approved_by_id" UUID,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "title" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "thrust_area" VARCHAR(160),
  "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
  "priority" "GoalPriority" NOT NULL DEFAULT 'MEDIUM',
  "source" "GoalSource" NOT NULL DEFAULT 'MANUAL',
  "visibility" "GoalVisibility" NOT NULL DEFAULT 'TEAM',
  "kpi_role" "GoalKpiRole" NOT NULL DEFAULT 'LOCAL',
  "uom_type" "UomType" NOT NULL DEFAULT 'NUMBER',
  "scoring_method" "ScoringMethod" NOT NULL,
  "weightage" DECIMAL(5, 2) NOT NULL,
  "baseline_value" DECIMAL(18, 4),
  "target_value" DECIMAL(18, 4),
  "current_value" DECIMAL(18, 4),
  "progress_percent" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "score" DECIMAL(6, 2),
  "unit" VARCHAR(64),
  "start_date" TIMESTAMPTZ(6),
  "due_date" TIMESTAMPTZ(6),
  "lock_date" TIMESTAMPTZ(6),
  "is_shared_master" BOOLEAN NOT NULL DEFAULT false,
  "is_inherited_target" BOOLEAN NOT NULL DEFAULT false,
  "is_target_editable" BOOLEAN NOT NULL DEFAULT true,
  "approval_timestamp" TIMESTAMPTZ(6),
  "kpi_definition_version" INTEGER,
  "last_synced_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "goals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goals_weightage_check" CHECK ("weightage" >= 0 AND "weightage" <= 100),
  CONSTRAINT "goals_progress_percent_check" CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100),
  CONSTRAINT "goals_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "goals_dates_check" CHECK ("start_date" IS NULL OR "due_date" IS NULL OR "due_date" >= "start_date"),
  CONSTRAINT "goals_shared_kpi_state_check" CHECK (
    ("kpi_role" = 'MASTER' AND "is_shared_master" = true AND "parent_shared_goal_id" IS NULL)
    OR ("kpi_role" = 'REPLICA' AND "is_shared_master" = false AND "parent_shared_goal_id" IS NOT NULL)
    OR ("kpi_role" = 'LOCAL' AND "is_shared_master" = false AND "parent_shared_goal_id" IS NULL)
  ),
  CONSTRAINT "goals_inherited_target_edit_check" CHECK (NOT ("is_inherited_target" = true AND "is_target_editable" = true)),
  CONSTRAINT "goals_kpi_version_check" CHECK ("kpi_definition_version" IS NULL OR "kpi_definition_version" >= 1),
  CONSTRAINT "goals_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "kpi_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "cycle_id" UUID,
  "owner_id" UUID NOT NULL,
  "team_id" UUID,
  "parent_kpi_id" UUID,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "status" "KpiStatus" NOT NULL DEFAULT 'DRAFT',
  "scoring_method" "ScoringMethod" NOT NULL,
  "unit" VARCHAR(64),
  "baseline_value" DECIMAL(18, 4),
  "target_value" DECIMAL(18, 4),
  "target_date" TIMESTAMPTZ(6),
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_definitions_org_code_key" UNIQUE ("organization_id", "code"),
  CONSTRAINT "kpi_definitions_current_version_check" CHECK ("current_version" >= 1),
  CONSTRAINT "kpi_definitions_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "kpi_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "kpi_definition_id" UUID NOT NULL,
  "assigned_to_user_id" UUID,
  "assigned_to_team_id" UUID,
  "assigned_by_id" UUID NOT NULL,
  "role" "GoalKpiRole" NOT NULL DEFAULT 'REPLICA',
  "local_weight" DECIMAL(5, 2),
  "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "kpi_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_assignments_target_check" CHECK (("assigned_to_user_id" IS NOT NULL) <> ("assigned_to_team_id" IS NOT NULL)),
  CONSTRAINT "kpi_assignments_local_weight_check" CHECK ("local_weight" IS NULL OR ("local_weight" >= 0 AND "local_weight" <= 100)),
  CONSTRAINT "kpi_assignments_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
  CONSTRAINT "kpi_assignments_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "kpi_sync_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "kpi_definition_id" UUID NOT NULL,
  "source_goal_id" UUID,
  "target_goal_id" UUID,
  "from_version" INTEGER NOT NULL,
  "to_version" INTEGER NOT NULL,
  "status" "KpiSyncStatus" NOT NULL DEFAULT 'PENDING',
  "changes" JSONB NOT NULL DEFAULT '{}',
  "error_message" TEXT,
  "synced_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kpi_sync_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_sync_logs_version_check" CHECK ("from_version" >= 0 AND "to_version" >= "from_version")
);

CREATE TABLE "check_ins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "governance_window_id" UUID NOT NULL,
  "submitted_by_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "quarter" "Quarter" NOT NULL,
  "status" "CheckInStatus" NOT NULL DEFAULT 'DRAFT',
  "actual_achievement" DECIMAL(18, 4),
  "progress_score" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "progress_status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "score" DECIMAL(6, 2),
  "confidence" DECIMAL(5, 2),
  "manager_comment" TEXT,
  "blockers" TEXT,
  "risk_signal" VARCHAR(120),
  "submitted_at" TIMESTAMPTZ(6),
  "reviewed_at" TIMESTAMPTZ(6),
  "locked_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_ins_org_goal_window_key" UNIQUE ("organization_id", "goal_id", "governance_window_id"),
  CONSTRAINT "check_ins_quarter_check" CHECK ("quarter" <> 'NONE'),
  CONSTRAINT "check_ins_progress_score_check" CHECK ("progress_score" >= 0 AND "progress_score" <= 100),
  CONSTRAINT "check_ins_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "check_ins_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 100)),
  CONSTRAINT "check_ins_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "goal_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "parent_comment_id" UUID,
  "thread_root_id" UUID,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "body" TEXT NOT NULL,
  "visibility" "GoalVisibility" NOT NULL DEFAULT 'MANAGER',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "goal_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_comments_depth_check" CHECK ("depth" >= 0),
  CONSTRAINT "goal_comments_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "goal_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "goal_plan_id" UUID NOT NULL,
  "governance_window_id" UUID,
  "requester_id" UUID NOT NULL,
  "subject_user_id" UUID NOT NULL,
  "approver_id" UUID NOT NULL,
  "decided_by_id" UUID,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decision" "ApprovalDecision",
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMPTZ(6),
  "decided_at" TIMESTAMPTZ(6),
  "comment" TEXT,
  "adaptive_card_payload" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "goal_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_approvals_due_at_check" CHECK ("due_at" IS NULL OR "due_at" >= "requested_at"),
  CONSTRAINT "goal_approvals_decision_check" CHECK (("status" = 'PENDING' AND "decision" IS NULL) OR ("status" <> 'PENDING')),
  CONSTRAINT "goal_approvals_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "activity_feed" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "actor_id" UUID,
  "team_id" UUID,
  "goal_id" UUID,
  "goal_comment_id" UUID,
  "escalation_log_id" UUID,
  "type" "ActivityType" NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" UUID NOT NULL,
  "summary" VARCHAR(280) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "title" VARCHAR(180) NOT NULL,
  "message" TEXT NOT NULL,
  "action_url" TEXT,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "read_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "escalation_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "subject_user_id" UUID NOT NULL,
  "assigned_to_user_id" UUID,
  "goal_plan_id" UUID,
  "check_in_id" UUID,
  "governance_window_id" UUID,
  "level" "EscalationLevel" NOT NULL,
  "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "overdue_days" INTEGER NOT NULL DEFAULT 0,
  "due_at" TIMESTAMPTZ(6),
  "escalated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "escalation_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "escalation_logs_overdue_days_check" CHECK ("overdue_days" >= 0),
  CONSTRAINT "escalation_logs_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "changed_by_id" UUID,
  "action" "AuditAction" NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" UUID NOT NULL,
  "old_data" JSONB,
  "new_data" JSONB,
  "request_id" VARCHAR(128),
  "trace_id" VARCHAR(128),
  "ip_address" VARCHAR(64),
  "user_agent" TEXT,
  "is_system_generated" BOOLEAN NOT NULL DEFAULT false,
  "is_locked_record_mutation" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organizations_status_idx" ON "organizations" ("status");
CREATE INDEX "users_org_manager_active_idx" ON "users" ("organization_id", "manager_id", "is_active");
CREATE INDEX "users_org_team_active_idx" ON "users" ("organization_id", "team_id", "is_active");
CREATE INDEX "users_org_role_status_idx" ON "users" ("organization_id", "role", "status");
CREATE INDEX "users_org_deleted_at_idx" ON "users" ("organization_id", "deleted_at");
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX "sessions_expires_idx" ON "sessions" ("expires");
CREATE INDEX "teams_org_parent_active_idx" ON "teams" ("organization_id", "parent_team_id", "is_active");
CREATE INDEX "teams_org_manager_active_idx" ON "teams" ("organization_id", "manager_id", "is_active");
CREATE INDEX "teams_org_department_code_active_idx" ON "teams" ("organization_id", "department_code", "is_active");
CREATE INDEX "teams_org_type_active_idx" ON "teams" ("organization_id", "type", "is_active");
CREATE INDEX "team_memberships_org_team_ends_at_idx" ON "team_memberships" ("organization_id", "team_id", "ends_at");
CREATE INDEX "team_memberships_org_user_ends_at_idx" ON "team_memberships" ("organization_id", "user_id", "ends_at");
CREATE UNIQUE INDEX "team_memberships_active_user_team_key" ON "team_memberships" ("organization_id", "team_id", "user_id") WHERE "ends_at" IS NULL;
CREATE UNIQUE INDEX "team_memberships_primary_user_key" ON "team_memberships" ("organization_id", "user_id") WHERE "ends_at" IS NULL AND "is_primary" = true;
CREATE INDEX "performance_cycles_org_status_idx" ON "performance_cycles" ("organization_id", "status");
CREATE INDEX "governance_windows_org_status_dates_idx" ON "governance_windows" ("organization_id", "status", "opens_at", "closes_at");
CREATE INDEX "governance_windows_org_type_quarter_idx" ON "governance_windows" ("organization_id", "type", "quarter");
CREATE INDEX "goal_plans_org_status_updated_at_idx" ON "goal_plans" ("organization_id", "status", "updated_at");
CREATE INDEX "goal_plans_org_cycle_status_idx" ON "goal_plans" ("organization_id", "cycle_id", "status");
CREATE INDEX "goal_plans_org_team_status_idx" ON "goal_plans" ("organization_id", "team_id", "status");
CREATE INDEX "goals_org_owner_cycle_status_idx" ON "goals" ("organization_id", "owner_id", "cycle_id", "status");
CREATE INDEX "goals_org_team_cycle_status_idx" ON "goals" ("organization_id", "team_id", "cycle_id", "status");
CREATE INDEX "goals_org_plan_status_idx" ON "goals" ("organization_id", "plan_id", "status");
CREATE INDEX "goals_org_priority_due_date_idx" ON "goals" ("organization_id", "priority", "due_date");
CREATE INDEX "goals_org_kpi_version_idx" ON "goals" ("organization_id", "kpi_definition_id", "kpi_definition_version");
CREATE INDEX "goals_org_shared_master_status_idx" ON "goals" ("organization_id", "is_shared_master", "status");
CREATE INDEX "goals_org_parent_shared_goal_idx" ON "goals" ("organization_id", "parent_shared_goal_id");
CREATE INDEX "goals_org_parent_goal_idx" ON "goals" ("organization_id", "parent_goal_id");
CREATE INDEX "kpi_definitions_org_owner_status_idx" ON "kpi_definitions" ("organization_id", "owner_id", "status");
CREATE INDEX "kpi_definitions_org_team_status_idx" ON "kpi_definitions" ("organization_id", "team_id", "status");
CREATE INDEX "kpi_definitions_org_parent_kpi_idx" ON "kpi_definitions" ("organization_id", "parent_kpi_id");
CREATE INDEX "kpi_definitions_org_cycle_status_idx" ON "kpi_definitions" ("organization_id", "cycle_id", "status");
CREATE INDEX "kpi_assignments_org_kpi_effective_to_idx" ON "kpi_assignments" ("organization_id", "kpi_definition_id", "effective_to");
CREATE INDEX "kpi_assignments_org_user_effective_to_idx" ON "kpi_assignments" ("organization_id", "assigned_to_user_id", "effective_to");
CREATE INDEX "kpi_assignments_org_team_effective_to_idx" ON "kpi_assignments" ("organization_id", "assigned_to_team_id", "effective_to");
CREATE UNIQUE INDEX "kpi_assignments_active_user_key" ON "kpi_assignments" ("organization_id", "kpi_definition_id", "assigned_to_user_id") WHERE "effective_to" IS NULL AND "assigned_to_user_id" IS NOT NULL;
CREATE UNIQUE INDEX "kpi_assignments_active_team_key" ON "kpi_assignments" ("organization_id", "kpi_definition_id", "assigned_to_team_id") WHERE "effective_to" IS NULL AND "assigned_to_team_id" IS NOT NULL;
CREATE INDEX "kpi_sync_logs_org_kpi_status_idx" ON "kpi_sync_logs" ("organization_id", "kpi_definition_id", "status");
CREATE INDEX "kpi_sync_logs_org_target_created_at_idx" ON "kpi_sync_logs" ("organization_id", "target_goal_id", "created_at");
CREATE INDEX "check_ins_org_goal_quarter_idx" ON "check_ins" ("organization_id", "goal_id", "quarter");
CREATE INDEX "check_ins_org_quarter_progress_status_idx" ON "check_ins" ("organization_id", "quarter", "progress_status");
CREATE INDEX "check_ins_org_submitter_status_idx" ON "check_ins" ("organization_id", "submitted_by_id", "status");
CREATE INDEX "check_ins_org_reviewer_status_idx" ON "check_ins" ("organization_id", "reviewer_id", "status");
CREATE INDEX "check_ins_org_window_status_idx" ON "check_ins" ("organization_id", "governance_window_id", "status");
CREATE INDEX "goal_comments_org_goal_created_at_idx" ON "goal_comments" ("organization_id", "goal_id", "created_at");
CREATE INDEX "goal_comments_org_author_created_at_idx" ON "goal_comments" ("organization_id", "author_id", "created_at");
CREATE INDEX "goal_comments_org_parent_created_at_idx" ON "goal_comments" ("organization_id", "parent_comment_id", "created_at");
CREATE INDEX "goal_comments_org_thread_created_at_idx" ON "goal_comments" ("organization_id", "thread_root_id", "created_at");
CREATE INDEX "goal_approvals_org_approver_status_idx" ON "goal_approvals" ("organization_id", "approver_id", "status");
CREATE INDEX "goal_approvals_org_subject_status_idx" ON "goal_approvals" ("organization_id", "subject_user_id", "status");
CREATE INDEX "goal_approvals_org_plan_status_idx" ON "goal_approvals" ("organization_id", "goal_plan_id", "status");
CREATE UNIQUE INDEX "goal_approvals_pending_plan_approver_key" ON "goal_approvals" ("organization_id", "goal_plan_id", "approver_id") WHERE "status" = 'PENDING';
CREATE INDEX "activity_feed_org_created_at_idx" ON "activity_feed" ("organization_id", "created_at");
CREATE INDEX "activity_feed_org_team_created_at_idx" ON "activity_feed" ("organization_id", "team_id", "created_at");
CREATE INDEX "activity_feed_org_goal_created_at_idx" ON "activity_feed" ("organization_id", "goal_id", "created_at");
CREATE INDEX "activity_feed_org_entity_idx" ON "activity_feed" ("organization_id", "entity_type", "entity_id");
CREATE INDEX "notifications_org_recipient_read_created_idx" ON "notifications" ("organization_id", "recipient_id", "is_read", "created_at");
CREATE INDEX "notifications_org_type_created_at_idx" ON "notifications" ("organization_id", "type", "created_at");
CREATE INDEX "notifications_unread_recipient_idx" ON "notifications" ("organization_id", "recipient_id", "created_at") WHERE "is_read" = false;
CREATE INDEX "escalation_logs_org_status_level_escalated_idx" ON "escalation_logs" ("organization_id", "status", "level", "escalated_at");
CREATE INDEX "escalation_logs_org_subject_status_idx" ON "escalation_logs" ("organization_id", "subject_user_id", "status");
CREATE INDEX "escalation_logs_org_assignee_status_idx" ON "escalation_logs" ("organization_id", "assigned_to_user_id", "status");
CREATE INDEX "audit_logs_org_entity_created_at_idx" ON "audit_logs" ("organization_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_org_changed_by_created_at_idx" ON "audit_logs" ("organization_id", "changed_by_id", "created_at");
CREATE INDEX "audit_logs_org_action_created_at_idx" ON "audit_logs" ("organization_id", "action", "created_at");

ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_team_id_fkey" FOREIGN KEY ("parent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_cycles" ADD CONSTRAINT "performance_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "governance_windows" ADD CONSTRAINT "governance_windows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "governance_windows" ADD CONSTRAINT "governance_windows_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "goal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_fkey" FOREIGN KEY ("parent_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_shared_goal_id_fkey" FOREIGN KEY ("parent_shared_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_parent_kpi_id_fkey" FOREIGN KEY ("parent_kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_assigned_to_team_id_fkey" FOREIGN KEY ("assigned_to_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_sync_logs" ADD CONSTRAINT "kpi_sync_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_sync_logs" ADD CONSTRAINT "kpi_sync_logs_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_sync_logs" ADD CONSTRAINT "kpi_sync_logs_source_goal_id_fkey" FOREIGN KEY ("source_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpi_sync_logs" ADD CONSTRAINT "kpi_sync_logs_target_goal_id_fkey" FOREIGN KEY ("target_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_governance_window_id_fkey" FOREIGN KEY ("governance_window_id") REFERENCES "governance_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_comments" ADD CONSTRAINT "goal_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_comments" ADD CONSTRAINT "goal_comments_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_comments" ADD CONSTRAINT "goal_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_comments" ADD CONSTRAINT "goal_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "goal_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_comments" ADD CONSTRAINT "goal_comments_thread_root_id_fkey" FOREIGN KEY ("thread_root_id") REFERENCES "goal_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_goal_plan_id_fkey" FOREIGN KEY ("goal_plan_id") REFERENCES "goal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_governance_window_id_fkey" FOREIGN KEY ("governance_window_id") REFERENCES "governance_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_approvals" ADD CONSTRAINT "goal_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_goal_comment_id_fkey" FOREIGN KEY ("goal_comment_id") REFERENCES "goal_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_escalation_log_id_fkey" FOREIGN KEY ("escalation_log_id") REFERENCES "escalation_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalation_logs" ADD CONSTRAINT "escalation_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "escalation_logs" ADD CONSTRAINT "escalation_logs_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "escalation_logs" ADD CONSTRAINT "escalation_logs_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "escalation_logs" ADD CONSTRAINT "escalation_logs_goal_plan_id_fkey" FOREIGN KEY ("goal_plan_id") REFERENCES "goal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "escalation_logs" ADD CONSTRAINT "escalation_logs_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "check_ins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "escalation_logs" ADD CONSTRAINT "escalation_logs_governance_window_id_fkey" FOREIGN KEY ("governance_window_id") REFERENCES "governance_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_audit_log_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_prevent_update"
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();

CREATE TRIGGER "audit_logs_prevent_delete"
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();

CREATE OR REPLACE FUNCTION "enforce_goal_plan_allocation"("target_goal_plan_id" UUID)
RETURNS VOID AS $$
DECLARE
  plan_status "GoalPlanStatus";
  active_goal_count INTEGER;
  active_goal_total NUMERIC(8, 2);
  smallest_goal_weight NUMERIC(8, 2);
BEGIN
  SELECT "status"
    INTO plan_status
  FROM "goal_plans"
  WHERE "id" = "target_goal_plan_id";

  IF plan_status IS NULL OR plan_status NOT IN ('SUBMITTED', 'APPROVED', 'ACTIVE', 'LOCKED') THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM("weightage"), 0)::NUMERIC(8, 2),
    COALESCE(MIN("weightage"), 0)::NUMERIC(8, 2)
    INTO active_goal_count, active_goal_total, smallest_goal_weight
  FROM "goals"
  WHERE "plan_id" = "target_goal_plan_id"
    AND "status" NOT IN ('CANCELLED', 'ARCHIVED');

  IF active_goal_count = 0 THEN
    RAISE EXCEPTION 'submitted goal plans require at least one active goal';
  END IF;

  IF active_goal_count > 8 THEN
    RAISE EXCEPTION 'goal plans cannot contain more than 8 active goals';
  END IF;

  IF smallest_goal_weight < 10 THEN
    RAISE EXCEPTION 'each active goal must have at least 10 percent weight';
  END IF;

  IF active_goal_total <> 100 THEN
    RAISE EXCEPTION 'active goal weightage must equal exactly 100 percent';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_goal_plan_allocation_from_goals"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM "enforce_goal_plan_allocation"(OLD."plan_id");
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP <> 'UPDATE' OR NEW."plan_id" <> OLD."plan_id") THEN
    PERFORM "enforce_goal_plan_allocation"(NEW."plan_id");
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_goal_plan_allocation_from_goal_plans"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "enforce_goal_plan_allocation"(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "goals_enforce_goal_plan_allocation"
AFTER INSERT OR UPDATE OR DELETE ON "goals"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_goal_plan_allocation_from_goals"();

CREATE CONSTRAINT TRIGGER "goal_plans_enforce_goal_plan_allocation"
AFTER INSERT OR UPDATE OF "status" ON "goal_plans"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_goal_plan_allocation_from_goal_plans"();
