SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
SELECT 'goals' as t, count(*) from goals
UNION ALL SELECT 'check_ins', count(*) from check_ins
UNION ALL SELECT 'goal_plans', count(*) from goal_plans
UNION ALL SELECT 'goal_approvals', count(*) from goal_approvals
UNION ALL SELECT 'escalation_logs', count(*) from escalation_logs
UNION ALL SELECT 'activity_feed', count(*) from activity_feed
UNION ALL SELECT 'audit_logs', count(*) from audit_logs
UNION ALL SELECT 'analytics_daily_snapshots', count(*) from analytics_daily_snapshots
UNION ALL SELECT 'analytics_quarter_snapshots', count(*) from analytics_quarter_snapshots;
