CREATE TABLE `hot_topic_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hot_topic_id` integer NOT NULL,
	`relevance_score` real NOT NULL,
	`recommend_follow` integer DEFAULT 0 NOT NULL,
	`recommendation_reason` text NOT NULL,
	`recommended_title` text NOT NULL,
	`shooting_direction` text NOT NULL,
	`live_theme` text NOT NULL,
	`analysis_source` text DEFAULT 'WorkBuddy热点监测报告' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hot_topic_id`) REFERENCES `hot_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topic_analysis_topic_source` ON `hot_topic_analysis` (`hot_topic_id`,`analysis_source`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_analysis_topic_id` ON `hot_topic_analysis` (`hot_topic_id`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_analysis_recommend_score` ON `hot_topic_analysis` (`recommend_follow`,`relevance_score`);
--> statement-breakpoint
PRAGMA optimize;
