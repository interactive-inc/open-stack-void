ALTER TABLE `chat_invitations` ADD `delivery_state` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_invitations` ADD `delivery_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_invitations` ADD `delivery_lease` text;--> statement-breakpoint
ALTER TABLE `chat_invitations` ADD `delivery_lease_until` integer DEFAULT 0 NOT NULL;