CREATE TABLE `account_cleanup_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`source_store_id` text,
	`next_store_id` text NOT NULL,
	`archive_required` integer,
	`stage` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_cleanup_active_owner_idx` ON `account_cleanup_operations` (`user_id`) WHERE "account_cleanup_operations"."stage" <> 'complete';--> statement-breakpoint
CREATE INDEX `account_cleanup_retry_idx` ON `account_cleanup_operations` (`stage`,`next_attempt_at`,`lease_until`);