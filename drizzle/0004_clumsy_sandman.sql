ALTER TABLE "p1_synchronization_attempts" DROP CONSTRAINT "p1_synchronization_attempts_p1_attempt_number_check";--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" DROP CONSTRAINT "p1_synchronization_runs_p1_attempt_count_check";--> statement-breakpoint
ALTER TABLE "p1_audit_events" ADD COLUMN "p1_request_id" uuid;--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD COLUMN "p1_scenario" varchar(32) DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD COLUMN "p1_manual_retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD COLUMN "p1_delivery_job_id" uuid;--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD COLUMN "p1_error_code" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "p1_audit_events_p1_request_unique" ON "p1_audit_events" USING btree ("p1_workspace_id","p1_action","p1_request_id");--> statement-breakpoint
ALTER TABLE "p1_synchronization_attempts" ADD CONSTRAINT "p1_synchronization_attempts_p1_attempt_number_check" CHECK ("p1_synchronization_attempts"."p1_attempt_number" >= 1 AND "p1_synchronization_attempts"."p1_attempt_number" <= 4);--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD CONSTRAINT "p1_synchronization_runs_p1_manual_retry_check" CHECK ("p1_synchronization_runs"."p1_manual_retry_count" IN (0, 1));--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD CONSTRAINT "p1_synchronization_runs_p1_scenario_check" CHECK ("p1_synchronization_runs"."p1_scenario" IN ('success', 'rate_limit', 'temporary_outage',
                'persistent_outage', 'invalid_destination'));--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD CONSTRAINT "p1_synchronization_runs_p1_attempt_count_check" CHECK ("p1_synchronization_runs"."p1_attempt_count" >= 0 AND "p1_synchronization_runs"."p1_attempt_count" <= 3 + "p1_synchronization_runs"."p1_manual_retry_count");