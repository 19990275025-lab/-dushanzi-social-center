CREATE TABLE `collection_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`collected_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_collection_logs_created_at` ON `collection_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_collection_logs_platform_status` ON `collection_logs` (`platform`,`status`);--> statement-breakpoint
ALTER TABLE `social_posts` ADD `collection_log_id` integer REFERENCES collection_logs(id);--> statement-breakpoint
CREATE INDEX `idx_social_posts_collection_log_id` ON `social_posts` (`collection_log_id`);