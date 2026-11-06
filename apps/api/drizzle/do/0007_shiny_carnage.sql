CREATE TABLE `_history_archive_chunks` (
	`operation_id` text NOT NULL,
	`chunk` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`operation_id`, `chunk`)
);
--> statement-breakpoint
CREATE TABLE `_history_archive_manifests` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`manifest_key` text NOT NULL,
	`month` text NOT NULL,
	`manifest` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `_history_archive_manifests_manifestKey_unique` ON `_history_archive_manifests` (`manifest_key`);--> statement-breakpoint
CREATE TABLE `_history_archive_months` (
	`month` text PRIMARY KEY NOT NULL,
	`raw_revision` integer DEFAULT 0 NOT NULL,
	`active_operation_id` text,
	`blocked_fingerprint` text,
	`blocked_error` text
);
--> statement-breakpoint
CREATE TABLE `_history_archive_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`store_id` text NOT NULL,
	`month` text NOT NULL,
	`source_schema_tag` text NOT NULL,
	`captured_through_seq` integer NOT NULL,
	`raw_revision` integer NOT NULL,
	`event_seq` integer NOT NULL,
	`month_raw_revision` integer NOT NULL,
	`stage` text NOT NULL,
	`manifest` text NOT NULL,
	`manifest_key` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `_history_phone_daily` (
	`store_id` text NOT NULL,
	`zone` text NOT NULL,
	`day` text NOT NULL,
	`device_id` text NOT NULL,
	`milliseconds` integer NOT NULL,
	PRIMARY KEY(`store_id`, `zone`, `day`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `_history_raw_revisions` (
	`kind` text NOT NULL,
	`row_key` text NOT NULL,
	`month` text NOT NULL,
	`revision` integer NOT NULL,
	PRIMARY KEY(`kind`, `row_key`)
);
--> statement-breakpoint
CREATE INDEX `history_raw_month_idx` ON `_history_raw_revisions` (`month`);--> statement-breakpoint
CREATE TABLE `_history_raw_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `_history_usage_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`zone` text NOT NULL,
	`through_day` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_daily_apps` (
	`store_id` text NOT NULL,
	`zone` text NOT NULL,
	`day` text NOT NULL,
	`device_id` text NOT NULL,
	`app` text NOT NULL,
	`milliseconds` integer NOT NULL,
	`first_at` text NOT NULL,
	`last_at` text NOT NULL,
	`device_names` text NOT NULL,
	PRIMARY KEY(`store_id`, `zone`, `day`, `device_id`, `app`)
);
--> statement-breakpoint
CREATE TABLE `usage_daily_devices` (
	`store_id` text NOT NULL,
	`zone` text NOT NULL,
	`day` text NOT NULL,
	`device_id` text NOT NULL,
	`device_name` text NOT NULL,
	`milliseconds` integer NOT NULL,
	PRIMARY KEY(`store_id`, `zone`, `day`, `device_id`)
);
--> statement-breakpoint
CREATE INDEX `calendar_events_end_instant_idx` ON `calendar_events` (julianday("end_at"));--> statement-breakpoint
CREATE INDEX `phone_uses_end_instant_idx` ON `phone_uses` (julianday("end_at"));--> statement-breakpoint
CREATE INDEX `usage_sessions_end_instant_idx` ON `usage_sessions` (julianday("end_at"));