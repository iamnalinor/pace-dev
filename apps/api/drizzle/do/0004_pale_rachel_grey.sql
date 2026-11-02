CREATE TABLE `phone_uses` (
	`device_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	PRIMARY KEY(`device_id`, `start_at`)
);
--> statement-breakpoint
CREATE INDEX `phone_uses_end_idx` ON `phone_uses` (`end_at`);