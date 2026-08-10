ALTER TABLE `hot_topics` ADD COLUMN `data_source` text;--> statement-breakpoint
UPDATE `hot_topics`
SET `data_source` = 'douyin_content_hot'
WHERE `platform` = 'douyin' AND `data_source` IS NULL;--> statement-breakpoint
DROP INDEX `uq_hot_topics_platform_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_platform_source_name`
ON `hot_topics` (`platform`, `data_source`, `topic_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_non_douyin_name`
ON `hot_topics` (`platform`, `topic_name`) WHERE `platform` <> 'douyin';--> statement-breakpoint
CREATE INDEX `idx_hot_topics_platform_data_source_ranking`
ON `hot_topics` (`platform`, `data_source`, `ranking`);--> statement-breakpoint
