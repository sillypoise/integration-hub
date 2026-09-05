import { sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgTable,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

export const p1_demo_workspaces = pgTable(
    "p1_demo_workspaces",
    {
        p1_id: uuid("p1_id").defaultRandom().primaryKey(),
        p1_token_hash: varchar("p1_token_hash", { length: 64 }).notNull(),
        p1_created_at: timestamp("p1_created_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
        p1_expires_at: timestamp("p1_expires_at", { mode: "date", withTimezone: true }).notNull(),
    },
    (table) => [
        uniqueIndex("p1_demo_workspaces_p1_token_hash_unique").on(table.p1_token_hash),
        index("p1_demo_workspaces_p1_expires_at_index").on(table.p1_expires_at),
        check(
            "p1_demo_workspaces_p1_expiration_check",
            sql`${table.p1_expires_at} > ${table.p1_created_at}`,
        ),
    ],
);

export const p1_source_events = pgTable(
    "p1_source_events",
    {
        p1_id: uuid("p1_id").defaultRandom().primaryKey(),
        p1_workspace_id: uuid("p1_workspace_id")
            .notNull()
            .references(() => p1_demo_workspaces.p1_id, { onDelete: "cascade" }),
        p1_idempotency_key: varchar("p1_idempotency_key", { length: 64 }).notNull(),
        p1_event_type: varchar("p1_event_type", { length: 64 }).notNull(),
        p1_payload: jsonb("p1_payload").notNull(),
        p1_received_at: timestamp("p1_received_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        unique("p1_source_events_p1_id_p1_workspace_id_unique").on(
            table.p1_id,
            table.p1_workspace_id,
        ),
        uniqueIndex("p1_source_events_p1_workspace_id_p1_idempotency_key_unique").on(
            table.p1_workspace_id,
            table.p1_idempotency_key,
        ),
        index("p1_source_events_p1_workspace_id_p1_received_at_index").on(
            table.p1_workspace_id,
            table.p1_received_at,
        ),
        check(
            "p1_source_events_p1_event_type_check",
            sql`${table.p1_event_type} = 'commerce.customer.updated'`,
        ),
        check(
            "p1_source_events_p1_payload_size_check",
            sql`octet_length(${table.p1_payload}::text) <= 16384`,
        ),
    ],
);

export const p1_synchronization_runs = pgTable(
    "p1_synchronization_runs",
    {
        p1_id: uuid("p1_id").defaultRandom().primaryKey(),
        p1_workspace_id: uuid("p1_workspace_id")
            .notNull()
            .references(() => p1_demo_workspaces.p1_id, { onDelete: "cascade" }),
        p1_source_event_id: uuid("p1_source_event_id").notNull(),
        p1_state: varchar("p1_state", { length: 32 }).notNull(),
        p1_attempt_count: integer("p1_attempt_count").default(0).notNull(),
        p1_scenario: varchar("p1_scenario", { length: 32 }).default("success").notNull(),
        p1_manual_retry_count: integer("p1_manual_retry_count").default(0).notNull(),
        p1_delivery_job_id: uuid("p1_delivery_job_id"),
        p1_error_code: varchar("p1_error_code", { length: 64 }),
        p1_next_attempt_at: timestamp("p1_next_attempt_at", {
            mode: "date",
            withTimezone: true,
        }),
        p1_created_at: timestamp("p1_created_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
        p1_updated_at: timestamp("p1_updated_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
        p1_completed_at: timestamp("p1_completed_at", { mode: "date", withTimezone: true }),
    },
    (table) => [
        unique("p1_synchronization_runs_p1_id_p1_workspace_id_unique").on(
            table.p1_id,
            table.p1_workspace_id,
        ),
        uniqueIndex("p1_synchronization_runs_p1_source_event_id_unique").on(
            table.p1_source_event_id,
        ),
        foreignKey({
            columns: [table.p1_source_event_id, table.p1_workspace_id],
            foreignColumns: [p1_source_events.p1_id, p1_source_events.p1_workspace_id],
            name: "p1_synchronization_runs_p1_source_event_workspace_foreign_key",
        }).onDelete("cascade"),
        index("p1_synchronization_runs_p1_workspace_id_p1_created_at_index").on(
            table.p1_workspace_id,
            table.p1_created_at,
        ),
        check(
            "p1_synchronization_runs_p1_state_check",
            sql`${table.p1_state} IN (
                'queued',
                'processing',
                'succeeded',
                'retryable_failure',
                'terminal_failure'
            )`,
        ),
        check(
            "p1_synchronization_runs_p1_attempt_count_check",
            sql`${table.p1_attempt_count} >= 0 AND ${table.p1_attempt_count} <= 3 + ${table.p1_manual_retry_count}`,
        ),
        check(
            "p1_synchronization_runs_p1_manual_retry_check",
            sql`${table.p1_manual_retry_count} IN (0, 1)`,
        ),
        check(
            "p1_synchronization_runs_p1_scenario_check",
            sql`${table.p1_scenario} IN ('success', 'rate_limit', 'temporary_outage',
                'persistent_outage', 'invalid_destination')`,
        ),
    ],
);

export const p1_synchronization_attempts = pgTable(
    "p1_synchronization_attempts",
    {
        p1_id: uuid("p1_id").defaultRandom().primaryKey(),
        p1_workspace_id: uuid("p1_workspace_id")
            .notNull()
            .references(() => p1_demo_workspaces.p1_id, { onDelete: "cascade" }),
        p1_run_id: uuid("p1_run_id").notNull(),
        p1_attempt_number: integer("p1_attempt_number").notNull(),
        p1_state: varchar("p1_state", { length: 32 }).notNull(),
        p1_error_code: varchar("p1_error_code", { length: 64 }),
        p1_started_at: timestamp("p1_started_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
        p1_completed_at: timestamp("p1_completed_at", { mode: "date", withTimezone: true }),
    },
    (table) => [
        uniqueIndex("p1_synchronization_attempts_p1_run_id_p1_attempt_number_unique").on(
            table.p1_run_id,
            table.p1_attempt_number,
        ),
        foreignKey({
            columns: [table.p1_run_id, table.p1_workspace_id],
            foreignColumns: [
                p1_synchronization_runs.p1_id,
                p1_synchronization_runs.p1_workspace_id,
            ],
            name: "p1_synchronization_attempts_p1_run_workspace_foreign_key",
        }).onDelete("cascade"),
        index("p1_synchronization_attempts_p1_workspace_id_p1_started_at_index").on(
            table.p1_workspace_id,
            table.p1_started_at,
        ),
        check(
            "p1_synchronization_attempts_p1_attempt_number_check",
            sql`${table.p1_attempt_number} >= 1 AND ${table.p1_attempt_number} <= 4`,
        ),
        check(
            "p1_synchronization_attempts_p1_state_check",
            sql`${table.p1_state} IN (
                'processing',
                'succeeded',
                'retryable_failure',
                'terminal_failure',
                'interrupted'
            )`,
        ),
    ],
);

export const p1_audit_events = pgTable(
    "p1_audit_events",
    {
        p1_id: uuid("p1_id").defaultRandom().primaryKey(),
        p1_workspace_id: uuid("p1_workspace_id")
            .notNull()
            .references(() => p1_demo_workspaces.p1_id, { onDelete: "cascade" }),
        p1_action: varchar("p1_action", { length: 64 }).notNull(),
        p1_resource_type: varchar("p1_resource_type", { length: 32 }).notNull(),
        p1_resource_id: uuid("p1_resource_id").notNull(),
        p1_request_id: uuid("p1_request_id"),
        p1_created_at: timestamp("p1_created_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        uniqueIndex("p1_audit_events_p1_request_unique").on(
            table.p1_workspace_id,
            table.p1_action,
            table.p1_request_id,
        ),
        index("p1_audit_events_p1_workspace_id_p1_created_at_index").on(
            table.p1_workspace_id,
            table.p1_created_at,
        ),
        check(
            "p1_audit_events_p1_action_check",
            sql`${table.p1_action} IN (
                'workspace_created',
                'event_accepted',
                'retry_requested',
                'workspace_reset'
            )`,
        ),
        check(
            "p1_audit_events_p1_resource_type_check",
            sql`${table.p1_resource_type} IN ('workspace', 'source_event', 'synchronization_run')`,
        ),
    ],
);

export const p1_simulated_crm_customers = pgTable(
    "p1_simulated_crm_customers",
    {
        p1_id: uuid("p1_id").defaultRandom().primaryKey(),
        p1_workspace_id: uuid("p1_workspace_id")
            .notNull()
            .references(() => p1_demo_workspaces.p1_id, { onDelete: "cascade" }),
        p1_external_id: varchar("p1_external_id", { length: 64 }).notNull(),
        p1_payload: jsonb("p1_payload").notNull(),
    },
    (table) => [
        unique("p1_simulated_crm_customers_p1_identity_unique").on(
            table.p1_workspace_id,
            table.p1_external_id,
        ),
        check(
            "p1_simulated_crm_customers_p1_payload_size_check",
            sql`octet_length(${table.p1_payload}::text) <= 16384`,
        ),
    ],
);

export const p1_simulated_crm_effects = pgTable(
    "p1_simulated_crm_effects",
    {
        p1_run_id: uuid("p1_run_id").primaryKey(),
        p1_workspace_id: uuid("p1_workspace_id").notNull(),
        p1_payload: jsonb("p1_payload").notNull(),
        p1_created_at: timestamp("p1_created_at", { mode: "date", withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.p1_run_id, table.p1_workspace_id],
            foreignColumns: [
                p1_synchronization_runs.p1_id,
                p1_synchronization_runs.p1_workspace_id,
            ],
            name: "p1_simulated_crm_effects_p1_run_workspace_foreign_key",
        }).onDelete("cascade"),
        index("p1_simulated_crm_effects_p1_workspace_id_index").on(table.p1_workspace_id),
        check(
            "p1_simulated_crm_effects_p1_payload_size_check",
            sql`octet_length(${table.p1_payload}::text) <= 16384`,
        ),
    ],
);

export const application_schema = {
    p1_simulated_crm_customers,
    p1_simulated_crm_effects,
    p1_audit_events,
    p1_demo_workspaces,
    p1_source_events,
    p1_synchronization_attempts,
    p1_synchronization_runs,
};
