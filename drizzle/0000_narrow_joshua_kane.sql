CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`vault_key` text NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_sessions` (
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`payload` text NOT NULL,
	`bytes` integer NOT NULL,
	`created` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `session_id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_owner_created` ON `cloud_sessions` (`user_id`,`created`);