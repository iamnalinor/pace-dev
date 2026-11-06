CREATE TABLE `history_checkpoint` (
	`id` integer PRIMARY KEY NOT NULL,
	`format` integer NOT NULL,
	`build` text NOT NULL,
	`store_id` text NOT NULL,
	`covered_seq` integer NOT NULL,
	`cutoff` text NOT NULL,
	`cutoff_timezone` text NOT NULL,
	`event_count` integer NOT NULL,
	`byte_count` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`sha256` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `history_checkpoint_chunks` (
	`chunk` integer PRIMARY KEY NOT NULL,
	`data` blob NOT NULL
);
