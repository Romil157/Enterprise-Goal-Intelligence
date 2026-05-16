CREATE TABLE IF NOT EXISTS "analytics_quarter_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "cycle_id" UUID,
  "quarter" "Quarter" NOT NULL,
  "subject_user_id" UUID,
  "team_id" UUID,
  "department" VARCHAR(160) NOT NULL DEFAULT 'Unassigned',
  "employee_count" INTEGER NOT NULL DEFAULT 0,
  "goal_count" INTEGER NOT NULL DEFAULT 0,
  "average_progress" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "approved_plans" INTEGER NOT NULL DEFAULT 0,
  "submitted_plans" INTEGER NOT NULL DEFAULT 0,
  "returned_plans" INTEGER NOT NULL DEFAULT 0,
  "draft_plans" INTEGER NOT NULL DEFAULT 0,
  "active_plans" INTEGER NOT NULL DEFAULT 0,
  "locked_plans" INTEGER NOT NULL DEFAULT 0,
  "check_in_total" INTEGER NOT NULL DEFAULT 0,
  "check_in_compliant" INTEGER NOT NULL DEFAULT 0,
  "check_in_compliance_rate" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "approval_total" INTEGER NOT NULL DEFAULT 0,
  "approval_decided" INTEGER NOT NULL DEFAULT 0,
  "approval_turnaround_hrs" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "escalation_count" INTEGER NOT NULL DEFAULT 0,
  "open_escalations" INTEGER NOT NULL DEFAULT 0,
  "sync_synced" INTEGER NOT NULL DEFAULT 0,
  "sync_pending" INTEGER NOT NULL DEFAULT 0,
  "sync_failed" INTEGER NOT NULL DEFAULT 0,
  "sync_skipped" INTEGER NOT NULL DEFAULT 0,
  "productivity_score" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_quarter_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_quarter_snapshots_counts_check" CHECK (
    "employee_count" >= 0
    AND "goal_count" >= 0
    AND "approved_plans" >= 0
    AND "submitted_plans" >= 0
    AND "returned_plans" >= 0
    AND "draft_plans" >= 0
    AND "active_plans" >= 0
    AND "locked_plans" >= 0
    AND "check_in_total" >= 0
    AND "check_in_compliant" >= 0
    AND "approval_total" >= 0
    AND "approval_decided" >= 0
    AND "escalation_count" >= 0
    AND "open_escalations" >= 0
  ),
  CONSTRAINT "analytics_quarter_snapshots_rates_check" CHECK (
    "average_progress" >= 0
    AND "average_progress" <= 100
    AND "check_in_compliance_rate" >= 0
    AND "check_in_compliance_rate" <= 100
    AND "productivity_score" >= 0
    AND "productivity_score" <= 100
  )
);

CREATE TABLE IF NOT EXISTS "analytics_daily_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "team_id" UUID,
  "captured_on" DATE NOT NULL,
  "activity_count" INTEGER NOT NULL DEFAULT 0,
  "overdue_approvals" INTEGER NOT NULL DEFAULT 0,
  "pending_approvals" INTEGER NOT NULL DEFAULT 0,
  "open_escalations" INTEGER NOT NULL DEFAULT 0,
  "critical_escalations" INTEGER NOT NULL DEFAULT 0,
  "governance_alerts" INTEGER NOT NULL DEFAULT 0,
  "submitted_plans" INTEGER NOT NULL DEFAULT 0,
  "approved_plans" INTEGER NOT NULL DEFAULT 0,
  "returned_plans" INTEGER NOT NULL DEFAULT 0,
  "check_ins_submitted" INTEGER NOT NULL DEFAULT 0,
  "sync_failures" INTEGER NOT NULL DEFAULT 0,
  "throughput_score" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_daily_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_daily_snapshots_counts_check" CHECK (
    "activity_count" >= 0
    AND "overdue_approvals" >= 0
    AND "pending_approvals" >= 0
    AND "open_escalations" >= 0
    AND "critical_escalations" >= 0
    AND "governance_alerts" >= 0
    AND "submitted_plans" >= 0
    AND "approved_plans" >= 0
    AND "returned_plans" >= 0
    AND "check_ins_submitted" >= 0
    AND "sync_failures" >= 0
  ),
  CONSTRAINT "analytics_daily_snapshots_score_check" CHECK ("throughput_score" >= 0 AND "throughput_score" <= 100)
);

ALTER TABLE "analytics_quarter_snapshots"
  ADD CONSTRAINT "analytics_quarter_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_quarter_snapshots"
  ADD CONSTRAINT "analytics_quarter_snapshots_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_quarter_snapshots"
  ADD CONSTRAINT "analytics_quarter_snapshots_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_quarter_snapshots"
  ADD CONSTRAINT "analytics_quarter_snapshots_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "analytics_daily_snapshots"
  ADD CONSTRAINT "analytics_daily_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_daily_snapshots"
  ADD CONSTRAINT "analytics_daily_snapshots_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "analytics_quarter_snapshots_org_cycle_quarter_generated_idx"
  ON "analytics_quarter_snapshots" ("organization_id", "cycle_id", "quarter", "generated_at");

CREATE INDEX IF NOT EXISTS "analytics_quarter_snapshots_org_subject_cycle_quarter_idx"
  ON "analytics_quarter_snapshots" ("organization_id", "subject_user_id", "cycle_id", "quarter");

CREATE INDEX IF NOT EXISTS "analytics_quarter_snapshots_org_team_cycle_quarter_idx"
  ON "analytics_quarter_snapshots" ("organization_id", "team_id", "cycle_id", "quarter");

CREATE INDEX IF NOT EXISTS "analytics_quarter_snapshots_org_department_cycle_quarter_idx"
  ON "analytics_quarter_snapshots" ("organization_id", "department", "cycle_id", "quarter");

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_quarter_snapshots_grain_key"
  ON "analytics_quarter_snapshots" (
    "organization_id",
    COALESCE("cycle_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "quarter",
    COALESCE("subject_user_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("team_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "department"
  );

CREATE INDEX IF NOT EXISTS "analytics_daily_snapshots_org_day_generated_idx"
  ON "analytics_daily_snapshots" ("organization_id", "captured_on", "generated_at");

CREATE INDEX IF NOT EXISTS "analytics_daily_snapshots_org_team_day_idx"
  ON "analytics_daily_snapshots" ("organization_id", "team_id", "captured_on");

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_daily_snapshots_grain_key"
  ON "analytics_daily_snapshots" (
    "organization_id",
    COALESCE("team_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "captured_on"
  );

CREATE INDEX IF NOT EXISTS "goal_approvals_org_status_due_idx"
  ON "goal_approvals" ("organization_id", "status", "due_at");

CREATE INDEX IF NOT EXISTS "goal_approvals_org_decided_turnaround_idx"
  ON "goal_approvals" ("organization_id", "decided_at", "requested_at")
  WHERE "decided_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "check_ins_org_quarter_status_submitted_idx"
  ON "check_ins" ("organization_id", "quarter", "status", "submitted_by_id");

CREATE INDEX IF NOT EXISTS "escalation_logs_org_status_due_subject_idx"
  ON "escalation_logs" ("organization_id", "status", "due_at", "subject_user_id");

CREATE INDEX IF NOT EXISTS "activity_feed_org_type_created_at_idx"
  ON "activity_feed" ("organization_id", "type", "created_at");

CREATE INDEX IF NOT EXISTS "goals_org_cycle_status_owner_progress_idx"
  ON "goals" ("organization_id", "cycle_id", "status", "owner_id", "progress_percent");
