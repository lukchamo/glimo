CREATE TABLE `action_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vitrina_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`action_id` text NOT NULL,
	`label` text NOT NULL,
	`sensitive` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `action_log_vitrina_idx` ON `action_log` (`vitrina_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `skills` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_es` text NOT NULL,
	`summary` text NOT NULL,
	`summary_es` text NOT NULL,
	`needs` text NOT NULL,
	`needs_es` text NOT NULL,
	`icon` text NOT NULL,
	`category` text NOT NULL,
	`states` text NOT NULL,
	`path` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skills_position_idx` ON `skills` (`position`);--> statement-breakpoint
CREATE TABLE `vitrinas` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
