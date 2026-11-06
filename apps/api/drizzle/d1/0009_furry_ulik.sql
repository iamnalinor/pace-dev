ALTER TABLE `login_nonces` ADD `device_brand` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `device_model` text;--> statement-breakpoint
ALTER TABLE `login_nonces` ADD `os_version` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_brand` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_model` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `os_version` text;