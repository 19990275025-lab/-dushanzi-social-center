ALTER TABLE `hot_topics` ADD COLUMN `topic_type` text NOT NULL DEFAULT 'hot_rank';--> statement-breakpoint
ALTER TABLE `hot_topics` ADD COLUMN `source` text NOT NULL DEFAULT 'system';--> statement-breakpoint
UPDATE `hot_topics`
SET `source` = COALESCE(NULLIF(`source_agent`, ''), NULLIF(`source_url`, ''), 'system');--> statement-breakpoint
CREATE INDEX `idx_hot_topics_platform_type_ranking`
ON `hot_topics` (`platform`, `topic_type`, `ranking`);--> statement-breakpoint
