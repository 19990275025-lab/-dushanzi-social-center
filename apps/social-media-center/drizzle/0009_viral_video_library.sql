CREATE TABLE `viral_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`category` text NOT NULL,
	`account_name` text,
	`title` text NOT NULL,
	`publish_time` text NOT NULL,
	`video_url` text,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`favorites` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`video_structure` text,
	`title_pattern` text,
	`first_three_seconds` text,
	`shooting_method` text,
	`interaction_method` text,
	`comment_feedback` text,
	`breakout_reason` text,
	`replicable_elements` text,
	`dushanzi_suggestion` text,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_record_id` text,
	`raw_payload` text,
	`collection_log_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`collection_log_id`) REFERENCES `collection_logs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `viral_videos_platform_check` CHECK (`platform` IN ('douyin','kuaishou','weibo')),
	CONSTRAINT `viral_videos_category_check` CHECK (`category` IN ('tourism','scenic','xinjiang','nature')),
	CONSTRAINT `viral_videos_source_type_check` CHECK (`source_type` IN ('chrome','excel','api','manual')),
	CONSTRAINT `viral_videos_views_check` CHECK (`views` >= 0),
	CONSTRAINT `viral_videos_likes_check` CHECK (`likes` >= 0),
	CONSTRAINT `viral_videos_comments_check` CHECK (`comments` >= 0),
	CONSTRAINT `viral_videos_favorites_check` CHECK (`favorites` >= 0),
	CONSTRAINT `viral_videos_shares_check` CHECK (`shares` >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_viral_videos_category_publish_time` ON `viral_videos` (`category`,`publish_time`);
--> statement-breakpoint
CREATE INDEX `idx_viral_videos_platform_views` ON `viral_videos` (`platform`,`views`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_viral_videos_source_record` ON `viral_videos` (`platform`,`source_record_id`) WHERE `source_record_id` IS NOT NULL;
