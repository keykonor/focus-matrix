CREATE TABLE `sync_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`source` text NOT NULL,
	`at` integer NOT NULL,
	`changes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_devices_token_hash_unique` ON `sync_devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sync_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_pairings_token_hash_unique` ON `sync_pairings` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sync_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`marks` text DEFAULT '{}' NOT NULL,
	`last_commit` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_versions` (
	`revision` integer PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `shared_plans` ADD `editable` integer DEFAULT 0 NOT NULL;