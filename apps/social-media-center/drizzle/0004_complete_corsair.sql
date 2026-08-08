ALTER TABLE `collection_logs` ADD `entity_type` text DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_logs` ADD `comment_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_comments` ADD `collection_log_id` integer REFERENCES collection_logs(id);--> statement-breakpoint
CREATE INDEX `idx_social_comments_collection_log_id` ON `social_comments` (`collection_log_id`);