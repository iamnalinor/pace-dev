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
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_at`);