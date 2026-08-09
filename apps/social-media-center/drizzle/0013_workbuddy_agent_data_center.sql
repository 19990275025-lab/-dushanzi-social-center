DROP VIEW IF EXISTS `HOT_TOPIC_DATA`;--> statement-breakpoint
CREATE TABLE `HOT_TOPIC_DATA` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `platform` text NOT NULL CHECK (`platform` IN ('douyin','kuaishou','weibo','web')),
  `rank` integer NOT NULL CHECK (`rank` > 0),
  `topic_title` text NOT NULL,
  `heat_value` text NOT NULL,
  `keyword` text NOT NULL,
  `url` text,
  `publish_time` text,
  `category` text,
  `source_agent` text NOT NULL,
  `ai_relevance_score` real,
  `ai_analysis` text,
  `ai_recommendation` text
);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topic_data_source_topic`
ON `HOT_TOPIC_DATA` (`source_agent`,`platform`,`topic_title`,`publish_time`);--> statement-breakpoint
CREATE INDEX `idx_hot_topic_data_platform_rank`
ON `HOT_TOPIC_DATA` (`platform`,`rank`);--> statement-breakpoint
CREATE INDEX `idx_hot_topic_data_relevance`
ON `HOT_TOPIC_DATA` (`ai_relevance_score`);--> statement-breakpoint
PRAGMA optimize;
