CREATE TABLE `account_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`telegram_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`session_id` text NOT NULL,
	`message_id` integer
);
--> statement-breakpoint
CREATE INDEX `account_confirmations_user_idx` ON `account_confirmations` (`user_id`,`action`,`status`);