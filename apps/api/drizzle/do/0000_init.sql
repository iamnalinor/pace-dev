CREATE TABLE `calendar_events` (
	`device_id` text NOT NULL,
	`event_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`title` text NOT NULL,
	`series` text,
	PRIMARY KEY(`device_id`, `event_id`, `start_at`)
);
--> statement-breakpoint
CREATE INDEX `calendar_events_start_idx` ON `calendar_events` (`start_at`);--> statement-breakpoint
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
CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`extends` text,
	`built_in` integer NOT NULL,
	`archived` integer NOT NULL,
	`definition` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`archived` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` text NOT NULL,
	`task_id` text NOT NULL,
	`number` integer,
	`label` text NOT NULL,
	`solved_at` text,
	`submitted_at` text,
	PRIMARY KEY(`task_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`preset_id` text NOT NULL,
	`project_id` text,
	`importance` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`due_tz` text,
	`start_at` text,
	`created_at` text NOT NULL,
	`closed_at` text,
	`outcome` text,
	`progress` real NOT NULL,
	`estimate_minutes` integer,
	`touched` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE TABLE `usage_sessions` (
	`device_id` text NOT NULL,
	`device_name` text NOT NULL,
	`app` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	PRIMARY KEY(`device_id`, `app`, `start_at`)
);
--> statement-breakpoint
CREATE INDEX `usage_sessions_start_idx` ON `usage_sessions` (`start_at`);