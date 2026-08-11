ALTER TABLE `hot_topics` ADD COLUMN `collection_date` text;--> statement-breakpoint
UPDATE `hot_topics`
SET `collection_date` = date(datetime(COALESCE(`collect_time`, `created_at`), '+8 hours'))
WHERE `collection_date` IS NULL OR trim(`collection_date`) = '';--> statement-breakpoint
DROP INDEX IF EXISTS `uq_hot_topics_platform_source_name`;--> statement-breakpoint
DROP INDEX IF EXISTS `uq_hot_topics_non_douyin_name`;--> statement-breakpoint
DROP INDEX IF EXISTS `uq_hot_topics_platform_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_daily_snapshot`
ON `hot_topics` (`platform`, `data_source`, `topic_name`, `collection_date`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_collection_date_platform`
ON `hot_topics` (`collection_date`, `platform`);--> statement-breakpoint
PRAGMA optimize;
