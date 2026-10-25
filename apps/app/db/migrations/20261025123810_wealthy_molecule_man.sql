CREATE TABLE `chat_bootstrap_claims` (
	`id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_channels_name_unique` ON `chat_channels` (`name`);--> statement-breakpoint
CREATE TABLE `chat_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_invitations_hash_unique` ON `chat_invitations` (`hash`);--> statement-breakpoint
CREATE TABLE `chat_members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_members_email_unique` ON `chat_members` (`email`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
