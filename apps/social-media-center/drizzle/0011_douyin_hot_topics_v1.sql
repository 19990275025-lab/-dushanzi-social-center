ALTER TABLE `hot_topics` ADD `ranking` integer;--> statement-breakpoint
ALTER TABLE `hot_topics` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `hot_topics` ADD `source_record_id` text;--> statement-breakpoint
ALTER TABLE `hot_topics` ADD `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `idx_hot_topics_platform_ranking` ON `hot_topics` (`platform`,`ranking`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_source_record` ON `hot_topics` (`platform`,`source_record_id`) WHERE `source_record_id` IS NOT NULL;
