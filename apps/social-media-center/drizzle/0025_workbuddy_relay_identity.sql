DROP INDEX IF EXISTS `uq_hot_topics_daily_snapshot`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_relay_identity`
ON `hot_topics` (`collection_date`, `platform`, `topic_type`, `topic_name`, `ranking`);
