CREATE TABLE `hot_topics_v12` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `platform` text NOT NULL CHECK (`platform` IN ('douyin','kuaishou','weibo','web')),
  `topic_name` text NOT NULL,
  `keyword` text NOT NULL,
  `heat_value` real DEFAULT 0 NOT NULL,
  `ranking` integer,
  `trend` text DEFAULT 'new' NOT NULL,
  `category` text,
  `related_degree` real,
  `ai_suggestion` text,
  `status` text DEFAULT 'active' NOT NULL,
  `source_url` text,
  `source_record_id` text,
  `source_agent` text,
  `hot_score` real,
  `recommended_topic` text,
  `video_direction` text,
  `publish_time_suggestion` text,
  `raw_payload` text,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE SET NULL,
  `collect_time` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
INSERT INTO `hot_topics_v12` (
  `id`, `platform`, `topic_name`, `keyword`, `heat_value`, `ranking`, `trend`,
  `category`, `related_degree`, `ai_suggestion`, `status`, `source_url`,
  `source_record_id`, `collection_log_id`, `collect_time`, `created_at`
)
SELECT `id`, `platform`, `topic_name`, `keyword`, `heat_value`, `ranking`, `trend`,
  `category`, `related_degree`, `ai_suggestion`, `status`, `source_url`,
  `source_record_id`, `collection_log_id`, `collect_time`, `created_at`
FROM `hot_topics`;--> statement-breakpoint
DROP TABLE `hot_topics`;--> statement-breakpoint
ALTER TABLE `hot_topics_v12` RENAME TO `hot_topics`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_platform_name` ON `hot_topics` (`platform`,`topic_name`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_platform_collect_time` ON `hot_topics` (`platform`,`collect_time`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_related_degree` ON `hot_topics` (`related_degree`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_status_heat` ON `hot_topics` (`status`,`heat_value`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_keyword` ON `hot_topics` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_platform_ranking` ON `hot_topics` (`platform`,`ranking`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_source_record` ON `hot_topics` (`platform`,`source_record_id`) WHERE `source_record_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_hot_topics_source_agent_collect_time` ON `hot_topics` (`source_agent`,`collect_time`);--> statement-breakpoint
CREATE VIEW `HOT_TOPIC_DATA` AS
SELECT `id`, `platform`, `topic_name`, `keyword`, `heat_value`, `ranking`, `trend`, `category`,
  `related_degree`, `hot_score`, `ai_suggestion`, `recommended_topic`, `video_direction`,
  `publish_time_suggestion`, `source_agent`, `source_url`, `source_record_id`,
  `status`, `collect_time`, `created_at`
FROM `hot_topics`;--> statement-breakpoint
PRAGMA optimize;
