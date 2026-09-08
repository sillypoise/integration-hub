CREATE TABLE "p1_demo_budgets" (
	"p1_resource" varchar(16) PRIMARY KEY NOT NULL,
	"p1_count" integer NOT NULL,
	"p1_window_started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "p1_demo_budgets_p1_resource_check" CHECK ("p1_demo_budgets"."p1_resource" IN ('events', 'workspaces')),
	CONSTRAINT "p1_demo_budgets_p1_count_check" CHECK ("p1_demo_budgets"."p1_count" >= 0 AND "p1_demo_budgets"."p1_count" <=
        CASE WHEN "p1_demo_budgets"."p1_resource" = 'events' THEN 2000 ELSE 200 END)
);
--> statement-breakpoint
-- Carry recent admissions into the first window rather than granting a release-time reset.
INSERT INTO p1_demo_budgets (p1_resource, p1_count, p1_window_started_at)
SELECT 'events', LEAST(count(*), 2000)::int, clock_timestamp()
FROM p1_audit_events WHERE p1_action = 'event_accepted'
    AND p1_created_at > clock_timestamp() - interval '24 hours';
--> statement-breakpoint
INSERT INTO p1_demo_budgets (p1_resource, p1_count, p1_window_started_at)
SELECT 'workspaces', LEAST(count(*), 200)::int, clock_timestamp()
FROM p1_demo_workspaces WHERE p1_created_at > clock_timestamp() - interval '24 hours';
