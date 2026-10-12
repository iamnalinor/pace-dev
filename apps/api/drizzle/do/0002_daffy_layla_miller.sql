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