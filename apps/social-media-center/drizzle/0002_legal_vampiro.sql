ALTER TABLE `hot_topics` ADD `keyword` text;--> statement-breakpoint
ALTER TABLE `hot_topics` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `hot_topics` ADD `created_at` text;--> statement-breakpoint
UPDATE `hot_topics` SET `keyword` = `topic_name` WHERE `keyword` IS NULL OR trim(`keyword`) = '';--> statement-breakpoint
UPDATE `hot_topics` SET `created_at` = COALESCE(`collect_time`, CURRENT_TIMESTAMP) WHERE `created_at` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_hot_topics_status_heat` ON `hot_topics` (`status`,`heat_value`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_keyword` ON `hot_topics` (`keyword`);
