CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notification_id` text NOT NULL,
	`session_id` text NOT NULL,
	`device` text NOT NULL,
	`method` text NOT NULL,
	`endpoint` text NOT NULL,
	`attempted_at` text NOT NULL,
	`result` text NOT NULL,
	`reason` text,
	`dismissed_at` text
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_idx` ON `notification_deliveries` (`notification_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	`read_at` text,
	`resolved_at` text,
	`resolution` text,
	`telegram_state` text NOT NULL,
	`telegram_chat_id` text,
	`telegram_message_id` integer,
	`telegram_sent_at` text
);
--> statement-breakpoint
CREATE INDEX `notifications_ref_idx` ON `notifications` (`kind`,`ref`);--> statement-breakpoint
CREATE INDEX `notifications_open_idx` ON `notifications` (`resolved_at`);--> statement-breakpoint
CREATE TABLE `poll_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`notification_id` text NOT NULL,
	`title` text,
	`body` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `poll_outbox_session_idx` ON `poll_outbox` (`session_id`,`seq`);