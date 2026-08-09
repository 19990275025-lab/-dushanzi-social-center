ALTER TABLE `social_posts` ADD `completion_rate` real;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `average_play_duration` real;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `traffic_sources` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `content_audience_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`platform` text NOT NULL,
	`gender_distribution` text DEFAULT '[]' NOT NULL,
	`age_distribution` text DEFAULT '[]' NOT NULL,
	`region_distribution` text DEFAULT '[]' NOT NULL,
	`source_type` text DEFAULT 'api' NOT NULL,
	`source_record_id` text,
	`raw_payload` text,
	`collection_log_id` integer,
	`collected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`collection_log_id`) REFERENCES `collection_logs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_audience_post` ON `content_audience_analysis` (`post_id`);
--> statement-breakpoint
CREATE INDEX `idx_content_audience_platform_collected_at` ON `content_audience_analysis` (`platform`,`collected_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_audience_source_record` ON `content_audience_analysis` (`platform`,`source_record_id`);
