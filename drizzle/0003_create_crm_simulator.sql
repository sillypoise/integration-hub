CREATE TABLE "p1_simulated_crm_customers" (
	"p1_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"p1_workspace_id" uuid NOT NULL,
	"p1_external_id" varchar(64) NOT NULL,
	"p1_payload" jsonb NOT NULL,
	CONSTRAINT "p1_simulated_crm_customers_p1_identity_unique" UNIQUE("p1_workspace_id","p1_external_id"),
	CONSTRAINT "p1_simulated_crm_customers_p1_payload_size_check" CHECK (octet_length("p1_simulated_crm_customers"."p1_payload"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "p1_simulated_crm_effects" (
	"p1_run_id" uuid PRIMARY KEY NOT NULL,
	"p1_workspace_id" uuid NOT NULL,
	"p1_payload" jsonb NOT NULL,
	"p1_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p1_simulated_crm_effects_p1_payload_size_check" CHECK (octet_length("p1_simulated_crm_effects"."p1_payload"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "p1_simulated_crm_customers" ADD CONSTRAINT "p1_simulated_crm_customers_p1_workspace_id_p1_demo_workspaces_p1_id_fk" FOREIGN KEY ("p1_workspace_id") REFERENCES "public"."p1_demo_workspaces"("p1_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p1_simulated_crm_effects" ADD CONSTRAINT "p1_simulated_crm_effects_p1_run_workspace_foreign_key" FOREIGN KEY ("p1_run_id","p1_workspace_id") REFERENCES "public"."p1_synchronization_runs"("p1_id","p1_workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "p1_simulated_crm_effects_p1_workspace_id_index" ON "p1_simulated_crm_effects" USING btree ("p1_workspace_id");