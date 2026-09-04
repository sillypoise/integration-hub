CREATE TABLE "p1_audit_events" (
	"p1_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"p1_workspace_id" uuid NOT NULL,
	"p1_action" varchar(64) NOT NULL,
	"p1_resource_type" varchar(32) NOT NULL,
	"p1_resource_id" uuid NOT NULL,
	"p1_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p1_audit_events_p1_action_check" CHECK ("p1_audit_events"."p1_action" IN (
                'workspace_created',
                'event_accepted',
                'retry_requested',
                'workspace_reset'
            )),
	CONSTRAINT "p1_audit_events_p1_resource_type_check" CHECK ("p1_audit_events"."p1_resource_type" IN ('workspace', 'source_event', 'synchronization_run'))
);
--> statement-breakpoint
CREATE TABLE "p1_demo_workspaces" (
	"p1_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"p1_token_hash" varchar(64) NOT NULL,
	"p1_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"p1_expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "p1_demo_workspaces_p1_expiration_check" CHECK ("p1_demo_workspaces"."p1_expires_at" > "p1_demo_workspaces"."p1_created_at")
);
--> statement-breakpoint
CREATE TABLE "p1_source_events" (
	"p1_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"p1_workspace_id" uuid NOT NULL,
	"p1_idempotency_key" varchar(64) NOT NULL,
	"p1_event_type" varchar(64) NOT NULL,
	"p1_payload" jsonb NOT NULL,
	"p1_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p1_source_events_p1_id_p1_workspace_id_unique" UNIQUE("p1_id","p1_workspace_id"),
	CONSTRAINT "p1_source_events_p1_event_type_check" CHECK ("p1_source_events"."p1_event_type" = 'commerce.customer.updated'),
	CONSTRAINT "p1_source_events_p1_payload_size_check" CHECK (octet_length("p1_source_events"."p1_payload"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "p1_synchronization_attempts" (
	"p1_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"p1_workspace_id" uuid NOT NULL,
	"p1_run_id" uuid NOT NULL,
	"p1_attempt_number" integer NOT NULL,
	"p1_state" varchar(32) NOT NULL,
	"p1_error_code" varchar(64),
	"p1_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"p1_completed_at" timestamp with time zone,
	CONSTRAINT "p1_synchronization_attempts_p1_attempt_number_check" CHECK ("p1_synchronization_attempts"."p1_attempt_number" >= 1 AND "p1_synchronization_attempts"."p1_attempt_number" <= 3),
	CONSTRAINT "p1_synchronization_attempts_p1_state_check" CHECK ("p1_synchronization_attempts"."p1_state" IN (
                'processing',
                'succeeded',
                'retryable_failure',
                'terminal_failure',
                'interrupted'
            ))
);
--> statement-breakpoint
CREATE TABLE "p1_synchronization_runs" (
	"p1_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"p1_workspace_id" uuid NOT NULL,
	"p1_source_event_id" uuid NOT NULL,
	"p1_state" varchar(32) NOT NULL,
	"p1_attempt_count" integer DEFAULT 0 NOT NULL,
	"p1_next_attempt_at" timestamp with time zone,
	"p1_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"p1_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"p1_completed_at" timestamp with time zone,
	CONSTRAINT "p1_synchronization_runs_p1_id_p1_workspace_id_unique" UNIQUE("p1_id","p1_workspace_id"),
	CONSTRAINT "p1_synchronization_runs_p1_state_check" CHECK ("p1_synchronization_runs"."p1_state" IN (
                'queued',
                'processing',
                'succeeded',
                'retryable_failure',
                'terminal_failure'
            )),
	CONSTRAINT "p1_synchronization_runs_p1_attempt_count_check" CHECK ("p1_synchronization_runs"."p1_attempt_count" >= 0 AND "p1_synchronization_runs"."p1_attempt_count" <= 3)
);
--> statement-breakpoint
ALTER TABLE "p1_audit_events" ADD CONSTRAINT "p1_audit_events_p1_workspace_id_p1_demo_workspaces_p1_id_fk" FOREIGN KEY ("p1_workspace_id") REFERENCES "public"."p1_demo_workspaces"("p1_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p1_source_events" ADD CONSTRAINT "p1_source_events_p1_workspace_id_p1_demo_workspaces_p1_id_fk" FOREIGN KEY ("p1_workspace_id") REFERENCES "public"."p1_demo_workspaces"("p1_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p1_synchronization_attempts" ADD CONSTRAINT "p1_synchronization_attempts_p1_workspace_id_p1_demo_workspaces_p1_id_fk" FOREIGN KEY ("p1_workspace_id") REFERENCES "public"."p1_demo_workspaces"("p1_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p1_synchronization_attempts" ADD CONSTRAINT "p1_synchronization_attempts_p1_run_workspace_foreign_key" FOREIGN KEY ("p1_run_id","p1_workspace_id") REFERENCES "public"."p1_synchronization_runs"("p1_id","p1_workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD CONSTRAINT "p1_synchronization_runs_p1_workspace_id_p1_demo_workspaces_p1_id_fk" FOREIGN KEY ("p1_workspace_id") REFERENCES "public"."p1_demo_workspaces"("p1_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p1_synchronization_runs" ADD CONSTRAINT "p1_synchronization_runs_p1_source_event_workspace_foreign_key" FOREIGN KEY ("p1_source_event_id","p1_workspace_id") REFERENCES "public"."p1_source_events"("p1_id","p1_workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "p1_audit_events_p1_workspace_id_p1_created_at_index" ON "p1_audit_events" USING btree ("p1_workspace_id","p1_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "p1_demo_workspaces_p1_token_hash_unique" ON "p1_demo_workspaces" USING btree ("p1_token_hash");--> statement-breakpoint
CREATE INDEX "p1_demo_workspaces_p1_expires_at_index" ON "p1_demo_workspaces" USING btree ("p1_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "p1_source_events_p1_workspace_id_p1_idempotency_key_unique" ON "p1_source_events" USING btree ("p1_workspace_id","p1_idempotency_key");--> statement-breakpoint
CREATE INDEX "p1_source_events_p1_workspace_id_p1_received_at_index" ON "p1_source_events" USING btree ("p1_workspace_id","p1_received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "p1_synchronization_attempts_p1_run_id_p1_attempt_number_unique" ON "p1_synchronization_attempts" USING btree ("p1_run_id","p1_attempt_number");--> statement-breakpoint
CREATE INDEX "p1_synchronization_attempts_p1_workspace_id_p1_started_at_index" ON "p1_synchronization_attempts" USING btree ("p1_workspace_id","p1_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "p1_synchronization_runs_p1_source_event_id_unique" ON "p1_synchronization_runs" USING btree ("p1_source_event_id");--> statement-breakpoint
CREATE INDEX "p1_synchronization_runs_p1_workspace_id_p1_created_at_index" ON "p1_synchronization_runs" USING btree ("p1_workspace_id","p1_created_at");