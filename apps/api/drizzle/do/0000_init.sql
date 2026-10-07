CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`task_id` text,
	`rule` text NOT NULL,
	`inputs` text NOT NULL,
	`outcome` text NOT NULL,
	`explanation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decisions_task_idx` ON `decisions` (`task_id`);--> statement-breakpoint
CREATE INDEX `decisions_at_idx` ON `decisions` (`at`);--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`device_id` text NOT NULL,
	`precision` text NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE INDEX `events_occurred_idx` ON `events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `observations_kind_key_idx` ON `observations` (`kind`,`key`);