CREATE TABLE `competitor_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`account_name` text NOT NULL,
	`account_url` text NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL,
	`industry` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_competitor_accounts_platform_url` ON `competitor_accounts` (`platform`,`account_url`);--> statement-breakpoint
CREATE TABLE `content_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_date` text NOT NULL,
	`platform` text NOT NULL,
	`task_title` text NOT NULL,
	`content_type` text NOT NULL,
	`responsible_person` text,
	`status` text DEFAULT 'idea' NOT NULL,
	`review_result` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_tasks_date_status` ON `content_tasks` (`task_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_content_tasks_responsible_person` ON `content_tasks` (`responsible_person`);--> statement-breakpoint
CREATE TABLE `hot_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`topic_name` text NOT NULL,
	`heat_value` real DEFAULT 0 NOT NULL,
	`trend` text DEFAULT 'new' NOT NULL,
	`category` text,
	`related_degree` real,
	`ai_suggestion` text,
	`collect_time` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hot_topics_platform_name` ON `hot_topics` (`platform`,`topic_name`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_platform_collect_time` ON `hot_topics` (`platform`,`collect_time`);--> statement-breakpoint
CREATE INDEX `idx_hot_topics_related_degree` ON `hot_topics` (`related_degree`);--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`account_name` text NOT NULL,
	`account_id` text NOT NULL,
	`account_url` text,
	`followers_count` integer DEFAULT 0 NOT NULL,
	`following_count` integer DEFAULT 0 NOT NULL,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_accounts_platform_account_id` ON `social_accounts` (`platform`,`account_id`);--> statement-breakpoint
CREATE INDEX `idx_social_accounts_platform_status` ON `social_accounts` (`platform`,`status`);--> statement-breakpoint
CREATE TABLE `social_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`platform` text NOT NULL,
	`username` text NOT NULL,
	`comment_text` text NOT NULL,
	`comment_time` text NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`sentiment` text DEFAULT 'unknown' NOT NULL,
	`keyword` text,
	`user_need` text,
	`ai_reply` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_social_comments_post_comment_time` ON `social_comments` (`post_id`,`comment_time`);--> statement-breakpoint
CREATE INDEX `idx_social_comments_sentiment` ON `social_comments` (`sentiment`);--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`platform` text NOT NULL,
	`title` text NOT NULL,
	`content_type` text NOT NULL,
	`publish_time` text NOT NULL,
	`video_url` text,
	`cover_url` text,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`favorites` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`fans_growth` integer DEFAULT 0 NOT NULL,
	`hashtags` text DEFAULT '[]' NOT NULL,
	`duration` integer,
	`ai_analysis` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_posts_account_title` ON `social_posts` (`account_id`,`title`);--> statement-breakpoint
CREATE INDEX `idx_social_posts_account_publish_time` ON `social_posts` (`account_id`,`publish_time`);--> statement-breakpoint
CREATE INDEX `idx_social_posts_platform_publish_time` ON `social_posts` (`platform`,`publish_time`);