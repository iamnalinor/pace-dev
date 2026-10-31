ALTER TABLE `login_nonces` ADD `from` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `ip` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `country` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `city` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `device_name` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `device_id` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `reply_chat_id` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `reply_message_id` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `kind` text DEFAULT 'browser' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `ip` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `country` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `city` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_id` text;--> statement-breakpoint
-- Before `label` goes, existing sessions get their kind and a readable name from it: an agent's
-- label was the computer's typed name; the server wrote `web` (widget), `android` (bot login) and `dev`.
UPDATE `sessions` SET
	`kind` = CASE
		WHEN `scope` = 'usage:write' THEN 'agent'
		WHEN `label` = 'dev' THEN 'dev'
		WHEN `label` = 'android' THEN 'app'
		ELSE 'browser'
	END,
	`name` = CASE
		WHEN `scope` = 'usage:write' THEN coalesce(`label`, '')
		WHEN `label` = 'dev' THEN 'Dev login'
		WHEN `label` = 'android' THEN 'Android'
		WHEN `label` = 'web' THEN 'Browser'
		ELSE coalesce(`label`, '')
	END;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `label`;