CREATE TABLE `shared_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`view_token_hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
