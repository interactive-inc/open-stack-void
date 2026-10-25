-- void:allow-destructive
CREATE TABLE `chat_authorization_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`verifier_hash` text NOT NULL,
	`user_code` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`member_id` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_challenges_expiry_idx` ON `chat_challenges` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `chat_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chat_credentials`("id", "member_id", "public_key", "counter", "name", "created_at") SELECT "id", "member_id", "public_key", "counter", "name", "created_at" FROM `chat_credentials`;--> statement-breakpoint
DROP TABLE `chat_credentials`;--> statement-breakpoint
ALTER TABLE `__new_chat_credentials` RENAME TO `chat_credentials`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_credentials_member_idx` ON `chat_credentials` (`member_id`);--> statement-breakpoint
CREATE TABLE `__new_chat_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `chat_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chat_sessions`("hash", "member_id", "kind", "name", "expires_at", "created_at") SELECT "hash", "member_id", "kind", "name", "expires_at", "created_at" FROM `chat_sessions`;--> statement-breakpoint
DROP TABLE `chat_sessions`;--> statement-breakpoint
ALTER TABLE `__new_chat_sessions` RENAME TO `chat_sessions`;--> statement-breakpoint
CREATE INDEX `chat_sessions_member_idx` ON `chat_sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `chat_sessions_expiry_idx` ON `chat_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `chat_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_chat_channels`("id", "name", "created_by", "created_at") SELECT "id", "name", "created_by", "created_at" FROM `chat_channels`;--> statement-breakpoint
DROP TABLE `chat_channels`;--> statement-breakpoint
ALTER TABLE `__new_chat_channels` RENAME TO `chat_channels`;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_channels_name_unique` ON `chat_channels` (`name`);--> statement-breakpoint
CREATE TABLE `__new_chat_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `chat_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_chat_invitations`("id", "hash", "email", "invited_by", "expires_at", "created_at") SELECT "id", "hash", "email", "invited_by", "expires_at", "created_at" FROM `chat_invitations`;--> statement-breakpoint
DROP TABLE `chat_invitations`;--> statement-breakpoint
ALTER TABLE `__new_chat_invitations` RENAME TO `chat_invitations`;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_invitations_hash_unique` ON `chat_invitations` (`hash`);
