ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'GOAL_REWORK_REQUESTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CHECK_IN_APPROVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CHECK_IN_REWORK_REQUESTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CHECK_IN_LOCKED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'ESCALATION_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'ESCALATION_RESOLVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'GOVERNANCE_OVERRIDE';

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "audit_sequence" BIGINT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "transaction_id" BIGINT;

CREATE SEQUENCE IF NOT EXISTS "audit_logs_audit_sequence_seq" AS BIGINT;
ALTER SEQUENCE "audit_logs_audit_sequence_seq" OWNED BY "audit_logs"."audit_sequence";

UPDATE "audit_logs"
SET "audit_sequence" = nextval('audit_logs_audit_sequence_seq'::regclass)
WHERE "audit_sequence" IS NULL;

SELECT setval(
  'audit_logs_audit_sequence_seq'::regclass,
  GREATEST(COALESCE((SELECT MAX("audit_sequence") FROM "audit_logs"), 0) + 1, 1),
  false
);

UPDATE "audit_logs"
SET "transaction_id" = txid_current()
WHERE "transaction_id" IS NULL;

ALTER TABLE "audit_logs" ALTER COLUMN "audit_sequence" SET DEFAULT nextval('audit_logs_audit_sequence_seq'::regclass);
ALTER TABLE "audit_logs" ALTER COLUMN "audit_sequence" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "transaction_id" SET DEFAULT txid_current();
ALTER TABLE "audit_logs" ALTER COLUMN "transaction_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "audit_logs_audit_sequence_key" ON "audit_logs" ("audit_sequence");
CREATE INDEX IF NOT EXISTS "audit_logs_org_entity_sequence_idx" ON "audit_logs" ("organization_id", "entity_type", "entity_id", "audit_sequence");
CREATE INDEX IF NOT EXISTS "audit_logs_org_transaction_sequence_idx" ON "audit_logs" ("organization_id", "transaction_id", "audit_sequence");
CREATE INDEX IF NOT EXISTS "audit_logs_org_trace_sequence_idx" ON "audit_logs" ("organization_id", "trace_id", "audit_sequence") WHERE "trace_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "audit_logs_org_locked_created_at_idx" ON "audit_logs" ("organization_id", "created_at") WHERE "is_locked_record_mutation" = true;
CREATE INDEX IF NOT EXISTS "audit_logs_old_data_gin_idx" ON "audit_logs" USING GIN ("old_data" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "audit_logs_new_data_gin_idx" ON "audit_logs" USING GIN ("new_data" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "audit_logs_metadata_gin_idx" ON "audit_logs" USING GIN ("metadata" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "activity_feed_org_type_created_at_idx" ON "activity_feed" ("organization_id", "type", "created_at");
CREATE INDEX IF NOT EXISTS "activity_feed_org_actor_created_at_idx" ON "activity_feed" ("organization_id", "actor_id", "created_at") WHERE "actor_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "escalation_logs_org_window_status_due_idx" ON "escalation_logs" ("organization_id", "governance_window_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "escalation_logs_org_plan_created_at_idx" ON "escalation_logs" ("organization_id", "goal_plan_id", "created_at") WHERE "goal_plan_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "escalation_logs_org_check_in_created_at_idx" ON "escalation_logs" ("organization_id", "check_in_id", "created_at") WHERE "check_in_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "kpi_sync_logs_org_source_created_at_idx" ON "kpi_sync_logs" ("organization_id", "source_goal_id", "created_at") WHERE "source_goal_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "kpi_sync_logs_changes_gin_idx" ON "kpi_sync_logs" USING GIN ("changes" jsonb_path_ops);

DROP TRIGGER IF EXISTS "audit_logs_prevent_update" ON "audit_logs";
DROP TRIGGER IF EXISTS "audit_logs_prevent_delete" ON "audit_logs";
DROP FUNCTION IF EXISTS "prevent_audit_log_mutation"();

CREATE OR REPLACE FUNCTION aq_gov_current_actor_id()
RETURNS UUID AS $$
DECLARE
  actor_setting TEXT;
BEGIN
  actor_setting := NULLIF(current_setting('app.current_user_id', true), '');

  IF actor_setting IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN actor_setting::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid app.current_user_id setting: expected UUID'
      USING ERRCODE = '22023';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION aq_gov_boolean_setting(setting_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  setting_value TEXT;
BEGIN
  setting_value := lower(NULLIF(current_setting(setting_name, true), ''));
  RETURN COALESCE(setting_value IN ('1', 'true', 't', 'yes', 'y', 'on'), false);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION aq_gov_request_context()
RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'requestId', NULLIF(current_setting('app.request_id', true), ''),
    'traceId', NULLIF(current_setting('app.trace_id', true), ''),
    'ipAddress', NULLIF(current_setting('app.ip_address', true), ''),
    'userAgent', NULLIF(current_setting('app.user_agent', true), ''),
    'kpiSyncId', NULLIF(current_setting('app.kpi_sync_id', true), ''),
    'kpiSyncOrigin', NULLIF(current_setting('app.kpi_sync_origin', true), ''),
    'systemActor', aq_gov_boolean_setting('app.system_actor'),
    'governanceBypass', aq_gov_boolean_setting('app.governance_bypass'),
    'transactionId', txid_current(),
    'backendPid', pg_backend_pid(),
    'applicationName', NULLIF(current_setting('application_name', true), '')
  ));
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION aq_gov_changed_columns(old_data JSONB, new_data JSONB)
RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(changed.key ORDER BY changed.key), ARRAY[]::TEXT[])
  FROM (
    SELECT DISTINCT keys.key
    FROM jsonb_object_keys(COALESCE(old_data, '{}'::JSONB) || COALESCE(new_data, '{}'::JSONB)) AS keys(key)
    WHERE COALESCE(old_data, '{}'::JSONB) -> keys.key IS DISTINCT FROM COALESCE(new_data, '{}'::JSONB) -> keys.key
  ) AS changed;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION aq_gov_is_admin_actor(target_organization_id UUID, target_actor_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF target_organization_id IS NULL OR target_actor_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM "users"
    WHERE "id" = target_actor_id
      AND "organization_id" = target_organization_id
      AND "role" = 'ADMIN'
      AND "status" = 'ACTIVE'
      AND "is_active" = true
      AND "deleted_at" IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_has_governance_bypass(target_organization_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  actor_id UUID;
BEGIN
  IF aq_gov_boolean_setting('app.system_actor') AND aq_gov_boolean_setting('app.governance_bypass') THEN
    RETURN true;
  END IF;

  actor_id := aq_gov_current_actor_id();
  RETURN aq_gov_is_admin_actor(target_organization_id, actor_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_goal_lock_context(
  target_status "GoalStatus",
  target_organization_id UUID,
  target_cycle_id UUID,
  target_lock_date TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  window_record RECORD;
  locked BOOLEAN := false;
  lock_reason TEXT;
BEGIN
  IF target_status = 'LOCKED' THEN
    locked := true;
    lock_reason := 'GOAL_STATUS_LOCKED';
  ELSIF target_lock_date IS NOT NULL AND target_lock_date <= statement_timestamp() THEN
    locked := true;
    lock_reason := 'GOAL_LOCK_DATE_ELAPSED';
  END IF;

  SELECT "id", "status", "locks_at", "closes_at"
    INTO window_record
  FROM "governance_windows"
  WHERE "organization_id" = target_organization_id
    AND "cycle_id" = target_cycle_id
    AND "type" = 'GOAL_SETTING'
    AND "quarter" = 'NONE'
  ORDER BY "created_at" DESC
  LIMIT 1;

  IF FOUND AND (
    window_record."status" IN ('LOCKED', 'CLOSED')
    OR window_record."locks_at" <= statement_timestamp()
  ) THEN
    locked := true;
    lock_reason := CASE
      WHEN window_record."status" = 'CLOSED' THEN 'GOAL_SETTING_WINDOW_CLOSED'
      WHEN window_record."status" = 'LOCKED' THEN 'GOAL_SETTING_WINDOW_LOCKED'
      ELSE 'GOAL_SETTING_WINDOW_LOCK_DATE_ELAPSED'
    END;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'locked', locked,
    'reason', lock_reason,
    'governanceWindowId', CASE WHEN FOUND THEN window_record."id" END,
    'windowStatus', CASE WHEN FOUND THEN window_record."status"::TEXT END,
    'windowLocksAt', CASE WHEN FOUND THEN window_record."locks_at" END,
    'windowClosesAt', CASE WHEN FOUND THEN window_record."closes_at" END
  ));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_check_in_lock_context(
  target_status "CheckInStatus",
  target_governance_window_id UUID
)
RETURNS JSONB AS $$
DECLARE
  window_record RECORD;
  locked BOOLEAN := false;
  lock_reason TEXT;
BEGIN
  IF target_status = 'LOCKED' THEN
    locked := true;
    lock_reason := 'CHECK_IN_STATUS_LOCKED';
  END IF;

  SELECT "id", "status", "locks_at", "closes_at", "quarter"
    INTO window_record
  FROM "governance_windows"
  WHERE "id" = target_governance_window_id
  LIMIT 1;

  IF FOUND AND (
    window_record."status" IN ('LOCKED', 'CLOSED')
    OR window_record."locks_at" <= statement_timestamp()
  ) THEN
    locked := true;
    lock_reason := CASE
      WHEN window_record."status" = 'CLOSED' THEN 'CHECK_IN_WINDOW_CLOSED'
      WHEN window_record."status" = 'LOCKED' THEN 'CHECK_IN_WINDOW_LOCKED'
      ELSE 'CHECK_IN_WINDOW_LOCK_DATE_ELAPSED'
    END;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'locked', locked,
    'reason', lock_reason,
    'governanceWindowId', CASE WHEN FOUND THEN window_record."id" END,
    'quarter', CASE WHEN FOUND THEN window_record."quarter"::TEXT END,
    'windowStatus', CASE WHEN FOUND THEN window_record."status"::TEXT END,
    'windowLocksAt', CASE WHEN FOUND THEN window_record."locks_at" END,
    'windowClosesAt', CASE WHEN FOUND THEN window_record."closes_at" END
  ));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_insert_audit(
  target_organization_id UUID,
  target_actor_id UUID,
  target_action "AuditAction",
  target_entity_type TEXT,
  target_entity_id UUID,
  target_old_data JSONB,
  target_new_data JSONB,
  target_metadata JSONB DEFAULT '{}'::JSONB,
  target_is_system_generated BOOLEAN DEFAULT false,
  target_is_locked_record_mutation BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
  resolved_actor_id UUID;
  request_context JSONB;
BEGIN
  request_context := aq_gov_request_context();
  resolved_actor_id := COALESCE(target_actor_id, aq_gov_current_actor_id());

  INSERT INTO "audit_logs" (
    "organization_id",
    "changed_by_id",
    "action",
    "entity_type",
    "entity_id",
    "old_data",
    "new_data",
    "request_id",
    "trace_id",
    "ip_address",
    "user_agent",
    "is_system_generated",
    "is_locked_record_mutation",
    "metadata",
    "transaction_id"
  ) VALUES (
    target_organization_id,
    resolved_actor_id,
    target_action,
    target_entity_type,
    target_entity_id,
    target_old_data,
    target_new_data,
    NULLIF(current_setting('app.request_id', true), ''),
    NULLIF(current_setting('app.trace_id', true), ''),
    NULLIF(current_setting('app.ip_address', true), ''),
    NULLIF(current_setting('app.user_agent', true), ''),
    target_is_system_generated OR aq_gov_boolean_setting('app.system_actor'),
    target_is_locked_record_mutation,
    jsonb_strip_nulls(
      COALESCE(target_metadata, '{}'::JSONB)
      || jsonb_build_object(
        'changedColumns', aq_gov_changed_columns(target_old_data, target_new_data),
        'requestContext', request_context
      )
    ),
    txid_current()
  )
  RETURNING "id" INTO audit_id;

  RETURN audit_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_insert_activity(
  target_organization_id UUID,
  target_actor_id UUID,
  target_team_id UUID,
  target_goal_id UUID,
  target_goal_comment_id UUID,
  target_escalation_log_id UUID,
  target_type "ActivityType",
  target_entity_type TEXT,
  target_entity_id UUID,
  target_summary TEXT,
  target_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
  activity_id UUID;
  resolved_actor_id UUID;
BEGIN
  resolved_actor_id := COALESCE(target_actor_id, aq_gov_current_actor_id());

  INSERT INTO "activity_feed" (
    "organization_id",
    "actor_id",
    "team_id",
    "goal_id",
    "goal_comment_id",
    "escalation_log_id",
    "type",
    "entity_type",
    "entity_id",
    "summary",
    "metadata"
  ) VALUES (
    target_organization_id,
    resolved_actor_id,
    target_team_id,
    target_goal_id,
    target_goal_comment_id,
    target_escalation_log_id,
    target_type,
    target_entity_type,
    target_entity_id,
    LEFT(COALESCE(target_summary, target_entity_type || ' activity'), 280),
    jsonb_strip_nulls(COALESCE(target_metadata, '{}'::JSONB) || jsonb_build_object(
      'requestContext', aq_gov_request_context()
    ))
  )
  RETURNING "id" INTO activity_id;

  RETURN activity_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'governance immutability violation: audit_logs cannot be updated or deleted'
    USING ERRCODE = '55000',
          HINT = 'Append a compensating audit record instead of mutating existing audit history.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION aq_gov_prevent_governance_delete()
RETURNS TRIGGER AS $$
DECLARE
  entity_name TEXT;
BEGIN
  entity_name := COALESCE(TG_ARGV[0], TG_TABLE_NAME);

  RAISE EXCEPTION 'governance delete violation: % records cannot be hard deleted', entity_name
    USING ERRCODE = '55000',
          HINT = 'Use an approved archive, cancel, resolve, lock, or soft-delete workflow to preserve compliance history.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION aq_gov_enforce_goal_update()
RETURNS TRIGGER AS $$
DECLARE
  lock_context JSONB;
BEGIN
  lock_context := aq_gov_goal_lock_context(OLD."status", OLD."organization_id", OLD."cycle_id", OLD."lock_date");

  IF COALESCE((lock_context ->> 'locked')::BOOLEAN, false)
     AND NOT aq_gov_has_governance_bypass(OLD."organization_id") THEN
    RAISE EXCEPTION 'governance lock violation: goal % cannot be updated after lock enforcement', OLD."id"
      USING ERRCODE = '42501',
            DETAIL = lock_context::TEXT,
            HINT = 'Use an active ADMIN actor or trusted system governance bypass for controlled corrections.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_enforce_check_in_update()
RETURNS TRIGGER AS $$
DECLARE
  lock_context JSONB;
BEGIN
  lock_context := aq_gov_check_in_lock_context(OLD."status", OLD."governance_window_id");

  IF COALESCE((lock_context ->> 'locked')::BOOLEAN, false)
     AND NOT aq_gov_has_governance_bypass(OLD."organization_id") THEN
    RAISE EXCEPTION 'governance lock violation: check-in % cannot be updated after lock enforcement', OLD."id"
      USING ERRCODE = '42501',
            DETAIL = lock_context::TEXT,
            HINT = 'Use an active ADMIN actor or trusted system governance bypass for controlled corrections.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_goals()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  activity_type "ActivityType";
  lock_context JSONB := '{}'::JSONB;
  locked_mutation BOOLEAN := false;
  kpi_changed BOOLEAN := false;
  hierarchy_changed BOOLEAN := false;
  activity_summary TEXT;
  metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(aq_gov_current_actor_id(), NEW."created_by_id");
    metadata := jsonb_build_object(
      'governanceDomain', 'GOAL',
      'status', NEW."status"::TEXT,
      'kpiRole', NEW."kpi_role"::TEXT
    );

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'CREATE',
      'goals',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      metadata,
      false,
      false
    );

    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      NEW."team_id",
      NEW."id",
      NULL,
      NULL,
      'GOAL_CREATED',
      'goals',
      NEW."id",
      'Goal created: ' || NEW."title",
      metadata
    );

    RETURN NEW;
  END IF;

  actor_id := COALESCE(aq_gov_current_actor_id(), NEW."updated_by_id");
  lock_context := aq_gov_goal_lock_context(OLD."status", OLD."organization_id", OLD."cycle_id", OLD."lock_date");
  locked_mutation := COALESCE((lock_context ->> 'locked')::BOOLEAN, false) AND aq_gov_has_governance_bypass(OLD."organization_id");
  kpi_changed := OLD."target_value" IS DISTINCT FROM NEW."target_value"
    OR OLD."current_value" IS DISTINCT FROM NEW."current_value"
    OR OLD."progress_percent" IS DISTINCT FROM NEW."progress_percent"
    OR OLD."kpi_definition_version" IS DISTINCT FROM NEW."kpi_definition_version"
    OR OLD."last_synced_at" IS DISTINCT FROM NEW."last_synced_at";
  hierarchy_changed := OLD."parent_goal_id" IS DISTINCT FROM NEW."parent_goal_id"
    OR OLD."parent_shared_goal_id" IS DISTINCT FROM NEW."parent_shared_goal_id";

  audit_action := CASE
    WHEN locked_mutation THEN 'LOCKED_UPDATE'::"AuditAction"
    WHEN kpi_changed AND (NEW."kpi_definition_id" IS NOT NULL OR NULLIF(current_setting('app.kpi_sync_id', true), '') IS NOT NULL) THEN 'SYNC'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'ACTIVE' AND (NEW."approval_timestamp" IS NOT NULL OR NEW."approved_by_id" IS NOT NULL) THEN 'APPROVE'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'CANCELLED' THEN 'REJECT'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  activity_type := CASE
    WHEN locked_mutation THEN 'GOVERNANCE_OVERRIDE'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'LOCKED' THEN 'GOAL_LOCKED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'ACTIVE' AND (NEW."approval_timestamp" IS NOT NULL OR NEW."approved_by_id" IS NOT NULL) THEN 'GOAL_APPROVED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'CANCELLED' THEN 'GOAL_REJECTED'::"ActivityType"
    WHEN hierarchy_changed THEN 'HIERARCHY_CHANGED'::"ActivityType"
    WHEN kpi_changed AND (NEW."kpi_definition_id" IS NOT NULL OR NULLIF(current_setting('app.kpi_sync_id', true), '') IS NOT NULL) THEN 'KPI_SYNCED'::"ActivityType"
    ELSE 'GOAL_UPDATED'::"ActivityType"
  END;

  activity_summary := CASE
    WHEN locked_mutation THEN 'Governance override updated locked goal: ' || NEW."title"
    WHEN activity_type = 'GOAL_LOCKED' THEN 'Goal locked: ' || NEW."title"
    WHEN activity_type = 'GOAL_APPROVED' THEN 'Goal approved: ' || NEW."title"
    WHEN activity_type = 'GOAL_REJECTED' THEN 'Goal rejected: ' || NEW."title"
    WHEN activity_type = 'HIERARCHY_CHANGED' THEN 'Goal hierarchy updated: ' || NEW."title"
    WHEN activity_type = 'KPI_SYNCED' THEN 'Goal KPI synchronized: ' || NEW."title"
    ELSE 'Goal updated: ' || NEW."title"
  END;

  metadata := jsonb_strip_nulls(jsonb_build_object(
    'governanceDomain', 'GOAL',
    'statusTransition', CASE WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN jsonb_build_object('from', OLD."status"::TEXT, 'to', NEW."status"::TEXT) END,
    'hierarchyChanged', CASE WHEN hierarchy_changed THEN true END,
    'kpiSynchronization', CASE WHEN kpi_changed THEN jsonb_build_object(
      'kpiDefinitionId', NEW."kpi_definition_id",
      'parentSharedGoalId', NEW."parent_shared_goal_id",
      'kpiDefinitionVersion', NEW."kpi_definition_version",
      'lastSyncedAt', NEW."last_synced_at"
    ) END,
    'lockContext', CASE WHEN lock_context <> '{}'::JSONB THEN lock_context END
  ));

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'goals',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    metadata,
    false,
    locked_mutation
  );

  PERFORM aq_gov_insert_activity(
    NEW."organization_id",
    actor_id,
    NEW."team_id",
    NEW."id",
    NULL,
    NULL,
    activity_type,
    'goals',
    NEW."id",
    activity_summary,
    metadata
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_goal_plans()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  activity_type "ActivityType";
  activity_summary TEXT;
  metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(aq_gov_current_actor_id(), NEW."owner_id");

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'CREATE',
      'goal_plans',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('governanceDomain', 'GOAL_PLAN', 'status', NEW."status"::TEXT),
      false,
      false
    );

    RETURN NEW;
  END IF;

  actor_id := COALESCE(aq_gov_current_actor_id(), NEW."submitted_by_id", NEW."approved_by_id", NEW."owner_id");

  audit_action := CASE
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'SUBMITTED' THEN 'SUBMIT'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" IN ('APPROVED', 'ACTIVE') THEN 'APPROVE'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REWORK_REQUESTED' THEN 'REQUEST_REWORK'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'LOCKED' THEN 'LOCKED_UPDATE'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  activity_type := CASE
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'SUBMITTED' THEN 'GOAL_SUBMITTED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" IN ('APPROVED', 'ACTIVE') THEN 'GOAL_APPROVED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REWORK_REQUESTED' THEN 'GOAL_REWORK_REQUESTED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'LOCKED' THEN 'GOAL_LOCKED'::"ActivityType"
    ELSE NULL
  END;

  metadata := jsonb_strip_nulls(jsonb_build_object(
    'governanceDomain', 'GOAL_PLAN',
    'statusTransition', CASE WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN jsonb_build_object('from', OLD."status"::TEXT, 'to', NEW."status"::TEXT) END,
    'ownerId', NEW."owner_id",
    'cycleId', NEW."cycle_id"
  ));

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'goal_plans',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    metadata,
    false,
    NEW."status" = 'LOCKED'
  );

  IF activity_type IS NOT NULL THEN
    activity_summary := CASE
      WHEN activity_type = 'GOAL_SUBMITTED' THEN 'Goal plan submitted for approval'
      WHEN activity_type = 'GOAL_APPROVED' THEN 'Goal plan approved'
      WHEN activity_type = 'GOAL_REWORK_REQUESTED' THEN 'Goal plan returned for rework'
      WHEN activity_type = 'GOAL_LOCKED' THEN 'Goal plan locked'
      ELSE 'Goal plan updated'
    END;

    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      NEW."team_id",
      NULL,
      NULL,
      NULL,
      activity_type,
      'goal_plans',
      NEW."id",
      activity_summary,
      metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_goal_approvals()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  activity_type "ActivityType";
  metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(aq_gov_current_actor_id(), NEW."requester_id");
    metadata := jsonb_build_object('governanceDomain', 'APPROVAL', 'status', NEW."status"::TEXT);

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'SUBMIT',
      'goal_approvals',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      metadata,
      false,
      false
    );

    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      NULL,
      NULL,
      NULL,
      NULL,
      'APPROVAL_REQUESTED',
      'goal_approvals',
      NEW."id",
      'Approval requested',
      metadata
    );

    RETURN NEW;
  END IF;

  actor_id := COALESCE(aq_gov_current_actor_id(), NEW."decided_by_id", NEW."requester_id");

  audit_action := CASE
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'APPROVED' THEN 'APPROVE'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REWORK_REQUESTED' THEN 'REQUEST_REWORK'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REJECTED' THEN 'REJECT'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  activity_type := CASE
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'APPROVED' THEN 'APPROVAL_APPROVED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REWORK_REQUESTED' THEN 'APPROVAL_REWORK_REQUESTED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REJECTED' THEN 'APPROVAL_REJECTED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN 'APPROVAL_DECIDED'::"ActivityType"
    ELSE NULL
  END;

  metadata := jsonb_strip_nulls(jsonb_build_object(
    'governanceDomain', 'APPROVAL',
    'statusTransition', CASE WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN jsonb_build_object('from', OLD."status"::TEXT, 'to', NEW."status"::TEXT) END,
    'decision', NEW."decision"::TEXT,
    'goalPlanId', NEW."goal_plan_id"
  ));

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'goal_approvals',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    metadata,
    false,
    false
  );

  IF activity_type IS NOT NULL THEN
    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      NULL,
      NULL,
      NULL,
      NULL,
      activity_type,
      'goal_approvals',
      NEW."id",
      'Approval decision recorded',
      metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_check_ins()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  activity_type "ActivityType";
  lock_context JSONB := '{}'::JSONB;
  locked_mutation BOOLEAN := false;
  goal_team_id UUID;
  metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(aq_gov_current_actor_id(), NEW."submitted_by_id");

    SELECT "team_id"
      INTO goal_team_id
    FROM "goals"
    WHERE "id" = NEW."goal_id";

    metadata := jsonb_build_object(
      'governanceDomain', 'CHECK_IN',
      'quarter', NEW."quarter"::TEXT,
      'status', NEW."status"::TEXT,
      'governanceWindowId', NEW."governance_window_id"
    );

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      CASE WHEN NEW."status" = 'SUBMITTED' THEN 'SUBMIT'::"AuditAction" ELSE 'CREATE'::"AuditAction" END,
      'check_ins',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      metadata,
      false,
      false
    );

    IF NEW."status" = 'SUBMITTED' THEN
      PERFORM aq_gov_insert_activity(
        NEW."organization_id",
        actor_id,
        goal_team_id,
        NEW."goal_id",
        NULL,
        NULL,
        'CHECK_IN_SUBMITTED',
        'check_ins',
        NEW."id",
        'Quarterly check-in submitted',
        metadata
      );
    END IF;

    RETURN NEW;
  END IF;

  actor_id := COALESCE(aq_gov_current_actor_id(), NEW."reviewer_id", NEW."submitted_by_id");
  lock_context := aq_gov_check_in_lock_context(OLD."status", OLD."governance_window_id");
  locked_mutation := COALESCE((lock_context ->> 'locked')::BOOLEAN, false) AND aq_gov_has_governance_bypass(OLD."organization_id");

  SELECT "team_id"
    INTO goal_team_id
  FROM "goals"
  WHERE "id" = NEW."goal_id";

  audit_action := CASE
    WHEN locked_mutation THEN 'LOCKED_UPDATE'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'SUBMITTED' THEN 'SUBMIT'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'APPROVED' THEN 'APPROVE'::"AuditAction"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REWORK_REQUESTED' THEN 'REQUEST_REWORK'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  activity_type := CASE
    WHEN locked_mutation THEN 'GOVERNANCE_OVERRIDE'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'SUBMITTED' THEN 'CHECK_IN_SUBMITTED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'APPROVED' THEN 'CHECK_IN_APPROVED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'REWORK_REQUESTED' THEN 'CHECK_IN_REWORK_REQUESTED'::"ActivityType"
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'LOCKED' THEN 'CHECK_IN_LOCKED'::"ActivityType"
    ELSE NULL
  END;

  metadata := jsonb_strip_nulls(jsonb_build_object(
    'governanceDomain', 'CHECK_IN',
    'quarter', NEW."quarter"::TEXT,
    'statusTransition', CASE WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN jsonb_build_object('from', OLD."status"::TEXT, 'to', NEW."status"::TEXT) END,
    'governanceWindowId', NEW."governance_window_id",
    'lockContext', CASE WHEN lock_context <> '{}'::JSONB THEN lock_context END
  ));

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'check_ins',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    metadata,
    false,
    locked_mutation
  );

  IF activity_type IS NOT NULL THEN
    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      goal_team_id,
      NEW."goal_id",
      NULL,
      NULL,
      activity_type,
      'check_ins',
      NEW."id",
      CASE
        WHEN activity_type = 'GOVERNANCE_OVERRIDE' THEN 'Governance override updated locked check-in'
        WHEN activity_type = 'CHECK_IN_SUBMITTED' THEN 'Quarterly check-in submitted'
        WHEN activity_type = 'CHECK_IN_APPROVED' THEN 'Quarterly check-in approved'
        WHEN activity_type = 'CHECK_IN_REWORK_REQUESTED' THEN 'Quarterly check-in returned for rework'
        WHEN activity_type = 'CHECK_IN_LOCKED' THEN 'Quarterly check-in locked'
        ELSE 'Quarterly check-in updated'
      END,
      metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_goal_comments()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  goal_team_id UUID;
  audit_action "AuditAction";
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(aq_gov_current_actor_id(), NEW."author_id");

    SELECT "team_id" INTO goal_team_id FROM "goals" WHERE "id" = NEW."goal_id";

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'CREATE',
      'goal_comments',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('governanceDomain', 'COMMENT', 'goalId', NEW."goal_id"),
      false,
      false
    );

    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      goal_team_id,
      NEW."goal_id",
      NEW."id",
      NULL,
      'COMMENT_ADDED',
      'goal_comments',
      NEW."id",
      'Comment added',
      jsonb_build_object('goalId', NEW."goal_id", 'visibility', NEW."visibility"::TEXT)
    );

    RETURN NEW;
  END IF;

  actor_id := COALESCE(aq_gov_current_actor_id(), NEW."author_id");
  audit_action := CASE
    WHEN OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL THEN 'DELETE'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'goal_comments',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    jsonb_build_object('governanceDomain', 'COMMENT', 'goalId', NEW."goal_id"),
    false,
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_notifications()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := aq_gov_current_actor_id();

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'CREATE',
      'notifications',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('governanceDomain', 'NOTIFICATION', 'type', NEW."type"::TEXT, 'recipientId', NEW."recipient_id"),
      aq_gov_boolean_setting('app.system_actor'),
      false
    );

    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      NULL,
      NULL,
      NULL,
      NULL,
      'NOTIFICATION_SENT',
      'notifications',
      NEW."id",
      'Notification sent: ' || NEW."title",
      jsonb_build_object('notificationType', NEW."type"::TEXT, 'recipientId', NEW."recipient_id")
    );

    RETURN NEW;
  END IF;

  actor_id := aq_gov_current_actor_id();

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    'UPDATE',
    'notifications',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    jsonb_build_object('governanceDomain', 'NOTIFICATION', 'type', NEW."type"::TEXT, 'recipientId', NEW."recipient_id"),
    aq_gov_boolean_setting('app.system_actor'),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_escalation_logs()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  activity_type "ActivityType";
  goal_id UUID;
  goal_team_id UUID;
  metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := aq_gov_current_actor_id();

    IF NEW."check_in_id" IS NOT NULL THEN
      SELECT c."goal_id", g."team_id"
        INTO goal_id, goal_team_id
      FROM "check_ins" c
      JOIN "goals" g ON g."id" = c."goal_id"
      WHERE c."id" = NEW."check_in_id";
    END IF;

    metadata := jsonb_build_object(
      'governanceDomain', 'ESCALATION',
      'level', NEW."level"::TEXT,
      'status', NEW."status"::TEXT,
      'subjectUserId', NEW."subject_user_id"
    );

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'ESCALATE',
      'escalation_logs',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      metadata,
      aq_gov_boolean_setting('app.system_actor'),
      false
    );

    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      goal_team_id,
      goal_id,
      NULL,
      NEW."id",
      'ESCALATION_CREATED',
      'escalation_logs',
      NEW."id",
      'Escalation created',
      metadata
    );

    RETURN NEW;
  END IF;

  actor_id := aq_gov_current_actor_id();

  IF NEW."check_in_id" IS NOT NULL THEN
    SELECT c."goal_id", g."team_id"
      INTO goal_id, goal_team_id
    FROM "check_ins" c
    JOIN "goals" g ON g."id" = c."goal_id"
    WHERE c."id" = NEW."check_in_id";
  END IF;

  audit_action := CASE
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'OPEN' THEN 'ESCALATE'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  activity_type := CASE
    WHEN OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'RESOLVED' THEN 'ESCALATION_RESOLVED'::"ActivityType"
    ELSE 'ESCALATION_UPDATED'::"ActivityType"
  END;

  metadata := jsonb_strip_nulls(jsonb_build_object(
    'governanceDomain', 'ESCALATION',
    'statusTransition', CASE WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN jsonb_build_object('from', OLD."status"::TEXT, 'to', NEW."status"::TEXT) END,
    'level', NEW."level"::TEXT,
    'subjectUserId', NEW."subject_user_id"
  ));

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'escalation_logs',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    metadata,
    aq_gov_boolean_setting('app.system_actor'),
    false
  );

  IF activity_type IS NOT NULL THEN
    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      goal_team_id,
      goal_id,
      NULL,
      NEW."id",
      activity_type,
      'escalation_logs',
      NEW."id",
      CASE WHEN activity_type = 'ESCALATION_RESOLVED' THEN 'Escalation resolved' ELSE 'Escalation updated' END,
      metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_kpi_definitions()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(aq_gov_current_actor_id(), NEW."owner_id");

    PERFORM aq_gov_insert_audit(
      NEW."organization_id",
      actor_id,
      'CREATE',
      'kpi_definitions',
      NEW."id",
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('governanceDomain', 'KPI_DEFINITION', 'status', NEW."status"::TEXT, 'currentVersion', NEW."current_version"),
      false,
      false
    );

    RETURN NEW;
  END IF;

  actor_id := COALESCE(aq_gov_current_actor_id(), NEW."owner_id");
  audit_action := CASE
    WHEN OLD."current_version" IS DISTINCT FROM NEW."current_version"
      OR OLD."target_value" IS DISTINCT FROM NEW."target_value"
      OR OLD."target_date" IS DISTINCT FROM NEW."target_date"
      THEN 'SYNC'::"AuditAction"
    ELSE 'UPDATE'::"AuditAction"
  END;

  metadata := jsonb_strip_nulls(jsonb_build_object(
    'governanceDomain', 'KPI_DEFINITION',
    'versionTransition', CASE WHEN OLD."current_version" IS DISTINCT FROM NEW."current_version" THEN jsonb_build_object('from', OLD."current_version", 'to', NEW."current_version") END,
    'statusTransition', CASE WHEN OLD."status" IS DISTINCT FROM NEW."status" THEN jsonb_build_object('from', OLD."status"::TEXT, 'to', NEW."status"::TEXT) END,
    'parentKpiChanged', CASE WHEN OLD."parent_kpi_id" IS DISTINCT FROM NEW."parent_kpi_id" THEN true END
  ));

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    audit_action,
    'kpi_definitions',
    NEW."id",
    to_jsonb(OLD),
    to_jsonb(NEW),
    metadata,
    false,
    false
  );

  IF audit_action = 'SYNC' THEN
    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      NEW."team_id",
      NULL,
      NULL,
      NULL,
      'KPI_SYNCED',
      'kpi_definitions',
      NEW."id",
      'Shared KPI definition synchronized: ' || NEW."name",
      metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_kpi_assignments()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  metadata JSONB;
BEGIN
  actor_id := CASE
    WHEN TG_OP = 'DELETE' THEN COALESCE(aq_gov_current_actor_id(), OLD."assigned_by_id")
    ELSE COALESCE(aq_gov_current_actor_id(), NEW."assigned_by_id")
  END;

  IF TG_OP = 'INSERT' THEN
    audit_action := 'CREATE';
    metadata := jsonb_build_object('governanceDomain', 'KPI_ASSIGNMENT', 'kpiDefinitionId', NEW."kpi_definition_id", 'role', NEW."role"::TEXT);

    PERFORM aq_gov_insert_audit(NEW."organization_id", actor_id, audit_action, 'kpi_assignments', NEW."id", NULL, to_jsonb(NEW), metadata, false, false);
    PERFORM aq_gov_insert_activity(NEW."organization_id", actor_id, NEW."assigned_to_team_id", NULL, NULL, NULL, 'KPI_SYNCED', 'kpi_assignments', NEW."id", 'Shared KPI assignment created', metadata);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    audit_action := 'UPDATE';
    metadata := jsonb_build_object('governanceDomain', 'KPI_ASSIGNMENT', 'kpiDefinitionId', NEW."kpi_definition_id", 'role', NEW."role"::TEXT);

    PERFORM aq_gov_insert_audit(NEW."organization_id", actor_id, audit_action, 'kpi_assignments', NEW."id", to_jsonb(OLD), to_jsonb(NEW), metadata, false, false);
    PERFORM aq_gov_insert_activity(NEW."organization_id", actor_id, NEW."assigned_to_team_id", NULL, NULL, NULL, 'KPI_SYNCED', 'kpi_assignments', NEW."id", 'Shared KPI assignment updated', metadata);
    RETURN NEW;
  END IF;

  PERFORM aq_gov_insert_audit(OLD."organization_id", actor_id, 'DELETE', 'kpi_assignments', OLD."id", to_jsonb(OLD), NULL, jsonb_build_object('governanceDomain', 'KPI_ASSIGNMENT'), false, false);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_kpi_sync_logs()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  goal_team_id UUID;
  metadata JSONB;
BEGIN
  actor_id := aq_gov_current_actor_id();

  IF COALESCE(NEW."target_goal_id", NEW."source_goal_id") IS NOT NULL THEN
    SELECT "team_id"
      INTO goal_team_id
    FROM "goals"
    WHERE "id" = COALESCE(NEW."target_goal_id", NEW."source_goal_id");
  END IF;

  metadata := jsonb_build_object(
    'governanceDomain', 'KPI_SYNC',
    'kpiDefinitionId', NEW."kpi_definition_id",
    'sourceGoalId', NEW."source_goal_id",
    'targetGoalId', NEW."target_goal_id",
    'fromVersion', NEW."from_version",
    'toVersion', NEW."to_version",
    'status', NEW."status"::TEXT
  );

  PERFORM aq_gov_insert_audit(
    NEW."organization_id",
    actor_id,
    'SYNC',
    'kpi_sync_logs',
    NEW."id",
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END,
    to_jsonb(NEW),
    metadata,
    aq_gov_boolean_setting('app.system_actor'),
    false
  );

  IF TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM NEW."status" THEN
    PERFORM aq_gov_insert_activity(
      NEW."organization_id",
      actor_id,
      goal_team_id,
      COALESCE(NEW."target_goal_id", NEW."source_goal_id"),
      NULL,
      NULL,
      'KPI_SYNCED',
      'kpi_sync_logs',
      NEW."id",
      'Shared KPI synchronization recorded',
      metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_hierarchy_users()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  activity_type "ActivityType";
  metadata JSONB;
BEGIN
  actor_id := aq_gov_current_actor_id();
  activity_type := CASE
    WHEN OLD."manager_id" IS DISTINCT FROM NEW."manager_id" THEN 'HIERARCHY_CHANGED'::"ActivityType"
    ELSE 'TEAM_UPDATED'::"ActivityType"
  END;
  metadata := jsonb_build_object(
    'governanceDomain', 'USER_HIERARCHY',
    'managerChanged', OLD."manager_id" IS DISTINCT FROM NEW."manager_id",
    'teamChanged', OLD."team_id" IS DISTINCT FROM NEW."team_id"
  );

  PERFORM aq_gov_insert_audit(NEW."organization_id", actor_id, 'UPDATE', 'users', NEW."id", to_jsonb(OLD), to_jsonb(NEW), metadata, false, false);
  PERFORM aq_gov_insert_activity(NEW."organization_id", actor_id, NEW."team_id", NULL, NULL, NULL, activity_type, 'users', NEW."id", 'User reporting or team assignment updated', metadata);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_hierarchy_teams()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  activity_type "ActivityType";
  metadata JSONB;
BEGIN
  actor_id := aq_gov_current_actor_id();
  activity_type := CASE
    WHEN OLD."parent_team_id" IS DISTINCT FROM NEW."parent_team_id" THEN 'HIERARCHY_CHANGED'::"ActivityType"
    ELSE 'TEAM_UPDATED'::"ActivityType"
  END;
  metadata := jsonb_build_object(
    'governanceDomain', 'TEAM_HIERARCHY',
    'parentTeamChanged', OLD."parent_team_id" IS DISTINCT FROM NEW."parent_team_id",
    'managerChanged', OLD."manager_id" IS DISTINCT FROM NEW."manager_id"
  );

  PERFORM aq_gov_insert_audit(NEW."organization_id", actor_id, 'UPDATE', 'teams', NEW."id", to_jsonb(OLD), to_jsonb(NEW), metadata, false, false);
  PERFORM aq_gov_insert_activity(NEW."organization_id", actor_id, NEW."id", NULL, NULL, NULL, activity_type, 'teams', NEW."id", 'Team hierarchy or manager assignment updated', metadata);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION aq_gov_audit_team_memberships()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  audit_action "AuditAction";
  metadata JSONB;
BEGIN
  actor_id := aq_gov_current_actor_id();

  IF TG_OP = 'INSERT' THEN
    audit_action := 'CREATE';
    metadata := jsonb_build_object('governanceDomain', 'TEAM_MEMBERSHIP', 'teamId', NEW."team_id", 'userId', NEW."user_id");
    PERFORM aq_gov_insert_audit(NEW."organization_id", actor_id, audit_action, 'team_memberships', NEW."id", NULL, to_jsonb(NEW), metadata, false, false);
    PERFORM aq_gov_insert_activity(NEW."organization_id", actor_id, NEW."team_id", NULL, NULL, NULL, 'TEAM_UPDATED', 'team_memberships', NEW."id", 'Team membership created', metadata);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    audit_action := 'UPDATE';
    metadata := jsonb_build_object('governanceDomain', 'TEAM_MEMBERSHIP', 'teamId', NEW."team_id", 'userId', NEW."user_id");
    PERFORM aq_gov_insert_audit(NEW."organization_id", actor_id, audit_action, 'team_memberships', NEW."id", to_jsonb(OLD), to_jsonb(NEW), metadata, false, false);
    PERFORM aq_gov_insert_activity(NEW."organization_id", actor_id, NEW."team_id", NULL, NULL, NULL, 'TEAM_UPDATED', 'team_memberships', NEW."id", 'Team membership updated', metadata);
    RETURN NEW;
  END IF;

  audit_action := 'DELETE';
  metadata := jsonb_build_object('governanceDomain', 'TEAM_MEMBERSHIP', 'teamId', OLD."team_id", 'userId', OLD."user_id");
  PERFORM aq_gov_insert_audit(OLD."organization_id", actor_id, audit_action, 'team_memberships', OLD."id", to_jsonb(OLD), NULL, metadata, false, false);
  PERFORM aq_gov_insert_activity(OLD."organization_id", actor_id, OLD."team_id", NULL, NULL, NULL, 'TEAM_UPDATED', 'team_memberships', OLD."id", 'Team membership removed', metadata);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS aq_gov_audit_logs_prevent_update ON "audit_logs";
DROP TRIGGER IF EXISTS aq_gov_audit_logs_prevent_delete ON "audit_logs";
CREATE TRIGGER aq_gov_audit_logs_prevent_update
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_audit_log_mutation();
CREATE TRIGGER aq_gov_audit_logs_prevent_delete
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS aq_gov_goals_enforce_lock_update ON "goals";
CREATE TRIGGER aq_gov_goals_enforce_lock_update
BEFORE UPDATE ON "goals"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_enforce_goal_update();

DROP TRIGGER IF EXISTS aq_gov_check_ins_enforce_lock_update ON "check_ins";
CREATE TRIGGER aq_gov_check_ins_enforce_lock_update
BEFORE UPDATE ON "check_ins"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_enforce_check_in_update();

DROP TRIGGER IF EXISTS aq_gov_goals_audit_insert ON "goals";
DROP TRIGGER IF EXISTS aq_gov_goals_audit_update ON "goals";
CREATE TRIGGER aq_gov_goals_audit_insert
AFTER INSERT ON "goals"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_goals();
CREATE TRIGGER aq_gov_goals_audit_update
AFTER UPDATE ON "goals"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_goals();

DROP TRIGGER IF EXISTS aq_gov_goal_plans_audit_insert ON "goal_plans";
DROP TRIGGER IF EXISTS aq_gov_goal_plans_audit_update ON "goal_plans";
CREATE TRIGGER aq_gov_goal_plans_audit_insert
AFTER INSERT ON "goal_plans"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_goal_plans();
CREATE TRIGGER aq_gov_goal_plans_audit_update
AFTER UPDATE ON "goal_plans"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_goal_plans();

DROP TRIGGER IF EXISTS aq_gov_goal_approvals_audit_insert ON "goal_approvals";
DROP TRIGGER IF EXISTS aq_gov_goal_approvals_audit_update ON "goal_approvals";
CREATE TRIGGER aq_gov_goal_approvals_audit_insert
AFTER INSERT ON "goal_approvals"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_goal_approvals();
CREATE TRIGGER aq_gov_goal_approvals_audit_update
AFTER UPDATE ON "goal_approvals"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_goal_approvals();

DROP TRIGGER IF EXISTS aq_gov_check_ins_audit_insert ON "check_ins";
DROP TRIGGER IF EXISTS aq_gov_check_ins_audit_update ON "check_ins";
CREATE TRIGGER aq_gov_check_ins_audit_insert
AFTER INSERT ON "check_ins"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_check_ins();
CREATE TRIGGER aq_gov_check_ins_audit_update
AFTER UPDATE ON "check_ins"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_check_ins();

DROP TRIGGER IF EXISTS aq_gov_goal_comments_audit_insert ON "goal_comments";
DROP TRIGGER IF EXISTS aq_gov_goal_comments_audit_update ON "goal_comments";
CREATE TRIGGER aq_gov_goal_comments_audit_insert
AFTER INSERT ON "goal_comments"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_goal_comments();
CREATE TRIGGER aq_gov_goal_comments_audit_update
AFTER UPDATE ON "goal_comments"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_goal_comments();

DROP TRIGGER IF EXISTS aq_gov_notifications_audit_insert ON "notifications";
DROP TRIGGER IF EXISTS aq_gov_notifications_audit_update ON "notifications";
CREATE TRIGGER aq_gov_notifications_audit_insert
AFTER INSERT ON "notifications"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_notifications();
CREATE TRIGGER aq_gov_notifications_audit_update
AFTER UPDATE ON "notifications"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_notifications();

DROP TRIGGER IF EXISTS aq_gov_escalation_logs_audit_insert ON "escalation_logs";
DROP TRIGGER IF EXISTS aq_gov_escalation_logs_audit_update ON "escalation_logs";
CREATE TRIGGER aq_gov_escalation_logs_audit_insert
AFTER INSERT ON "escalation_logs"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_escalation_logs();
CREATE TRIGGER aq_gov_escalation_logs_audit_update
AFTER UPDATE ON "escalation_logs"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_escalation_logs();

DROP TRIGGER IF EXISTS aq_gov_kpi_definitions_audit_insert ON "kpi_definitions";
DROP TRIGGER IF EXISTS aq_gov_kpi_definitions_audit_update ON "kpi_definitions";
CREATE TRIGGER aq_gov_kpi_definitions_audit_insert
AFTER INSERT ON "kpi_definitions"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_kpi_definitions();
CREATE TRIGGER aq_gov_kpi_definitions_audit_update
AFTER UPDATE ON "kpi_definitions"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_kpi_definitions();

DROP TRIGGER IF EXISTS aq_gov_kpi_assignments_audit_insert ON "kpi_assignments";
DROP TRIGGER IF EXISTS aq_gov_kpi_assignments_audit_update ON "kpi_assignments";
DROP TRIGGER IF EXISTS aq_gov_kpi_assignments_audit_delete ON "kpi_assignments";
CREATE TRIGGER aq_gov_kpi_assignments_audit_insert
AFTER INSERT ON "kpi_assignments"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_kpi_assignments();
CREATE TRIGGER aq_gov_kpi_assignments_audit_update
AFTER UPDATE ON "kpi_assignments"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_kpi_assignments();

DROP TRIGGER IF EXISTS aq_gov_kpi_sync_logs_audit_insert ON "kpi_sync_logs";
DROP TRIGGER IF EXISTS aq_gov_kpi_sync_logs_audit_update ON "kpi_sync_logs";
CREATE TRIGGER aq_gov_kpi_sync_logs_audit_insert
AFTER INSERT ON "kpi_sync_logs"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_kpi_sync_logs();
CREATE TRIGGER aq_gov_kpi_sync_logs_audit_update
AFTER UPDATE ON "kpi_sync_logs"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_kpi_sync_logs();

DROP TRIGGER IF EXISTS aq_gov_users_hierarchy_audit_update ON "users";
CREATE TRIGGER aq_gov_users_hierarchy_audit_update
AFTER UPDATE ON "users"
FOR EACH ROW
WHEN (OLD."manager_id" IS DISTINCT FROM NEW."manager_id" OR OLD."team_id" IS DISTINCT FROM NEW."team_id")
EXECUTE FUNCTION aq_gov_audit_hierarchy_users();

DROP TRIGGER IF EXISTS aq_gov_teams_hierarchy_audit_update ON "teams";
CREATE TRIGGER aq_gov_teams_hierarchy_audit_update
AFTER UPDATE ON "teams"
FOR EACH ROW
WHEN (OLD."parent_team_id" IS DISTINCT FROM NEW."parent_team_id" OR OLD."manager_id" IS DISTINCT FROM NEW."manager_id")
EXECUTE FUNCTION aq_gov_audit_hierarchy_teams();

DROP TRIGGER IF EXISTS aq_gov_team_memberships_audit_insert ON "team_memberships";
DROP TRIGGER IF EXISTS aq_gov_team_memberships_audit_update ON "team_memberships";
DROP TRIGGER IF EXISTS aq_gov_team_memberships_audit_delete ON "team_memberships";
CREATE TRIGGER aq_gov_team_memberships_audit_insert
AFTER INSERT ON "team_memberships"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_team_memberships();
CREATE TRIGGER aq_gov_team_memberships_audit_update
AFTER UPDATE ON "team_memberships"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION aq_gov_audit_team_memberships();
CREATE TRIGGER aq_gov_team_memberships_audit_delete
AFTER DELETE ON "team_memberships"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_audit_team_memberships();

DROP TRIGGER IF EXISTS aq_gov_goals_prevent_delete ON "goals";
DROP TRIGGER IF EXISTS aq_gov_goal_plans_prevent_delete ON "goal_plans";
DROP TRIGGER IF EXISTS aq_gov_check_ins_prevent_delete ON "check_ins";
DROP TRIGGER IF EXISTS aq_gov_goal_comments_prevent_delete ON "goal_comments";
DROP TRIGGER IF EXISTS aq_gov_goal_approvals_prevent_delete ON "goal_approvals";
DROP TRIGGER IF EXISTS aq_gov_activity_feed_prevent_delete ON "activity_feed";
DROP TRIGGER IF EXISTS aq_gov_escalation_logs_prevent_delete ON "escalation_logs";
DROP TRIGGER IF EXISTS aq_gov_kpi_definitions_prevent_delete ON "kpi_definitions";
DROP TRIGGER IF EXISTS aq_gov_kpi_assignments_prevent_delete ON "kpi_assignments";
DROP TRIGGER IF EXISTS aq_gov_kpi_sync_logs_prevent_delete ON "kpi_sync_logs";
DROP TRIGGER IF EXISTS aq_gov_notifications_prevent_delete ON "notifications";
DROP TRIGGER IF EXISTS aq_gov_governance_windows_prevent_delete ON "governance_windows";
DROP TRIGGER IF EXISTS aq_gov_performance_cycles_prevent_delete ON "performance_cycles";

CREATE TRIGGER aq_gov_goals_prevent_delete
BEFORE DELETE ON "goals"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('goals');
CREATE TRIGGER aq_gov_goal_plans_prevent_delete
BEFORE DELETE ON "goal_plans"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('goal_plans');
CREATE TRIGGER aq_gov_check_ins_prevent_delete
BEFORE DELETE ON "check_ins"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('check_ins');
CREATE TRIGGER aq_gov_goal_comments_prevent_delete
BEFORE DELETE ON "goal_comments"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('goal_comments');
CREATE TRIGGER aq_gov_goal_approvals_prevent_delete
BEFORE DELETE ON "goal_approvals"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('goal_approvals');
CREATE TRIGGER aq_gov_activity_feed_prevent_delete
BEFORE DELETE ON "activity_feed"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('activity_feed');
CREATE TRIGGER aq_gov_escalation_logs_prevent_delete
BEFORE DELETE ON "escalation_logs"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('escalation_logs');
CREATE TRIGGER aq_gov_kpi_definitions_prevent_delete
BEFORE DELETE ON "kpi_definitions"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('kpi_definitions');
CREATE TRIGGER aq_gov_kpi_assignments_prevent_delete
BEFORE DELETE ON "kpi_assignments"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('kpi_assignments');
CREATE TRIGGER aq_gov_kpi_sync_logs_prevent_delete
BEFORE DELETE ON "kpi_sync_logs"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('kpi_sync_logs');
CREATE TRIGGER aq_gov_notifications_prevent_delete
BEFORE DELETE ON "notifications"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('notifications');
CREATE TRIGGER aq_gov_governance_windows_prevent_delete
BEFORE DELETE ON "governance_windows"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('governance_windows');
CREATE TRIGGER aq_gov_performance_cycles_prevent_delete
BEFORE DELETE ON "performance_cycles"
FOR EACH ROW
EXECUTE FUNCTION aq_gov_prevent_governance_delete('performance_cycles');
