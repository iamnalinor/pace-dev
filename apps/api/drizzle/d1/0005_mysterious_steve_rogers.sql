CREATE TABLE `fcm_refused_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`refused_at` integer NOT NULL
);
