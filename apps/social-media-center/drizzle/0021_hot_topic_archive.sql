CREATE TABLE `hot_topic_archive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`archive_date` text NOT NULL,
	`hot_topic_id` integer NOT NULL,
	`topic_name` text NOT NULL,
	`platform` text NOT NULL,
	`topic_type` text DEFAULT 'hot_rank' NOT NULL,
	`heat_value` real DEFAULT 0 NOT NULL,
	`ai_score` real,
	`recommendation_level` text DEFAULT 'C' NOT NULL,
	`recommended_title` text,
	`content_direction` text,
	`related_post_id` integer,
	`effect_score` real,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hot_topic_id`) REFERENCES `hot_topics`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`related_post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topic_archive_date_topic` ON `hot_topic_archive` (`archive_date`,`hot_topic_id`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_archive_date_platform` ON `hot_topic_archive` (`archive_date`,`platform`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_archive_type_date` ON `hot_topic_archive` (`topic_type`,`archive_date`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_archive_level_score` ON `hot_topic_archive` (`recommendation_level`,`effect_score`);
--> statement-breakpoint
PRAGMA optimize;
