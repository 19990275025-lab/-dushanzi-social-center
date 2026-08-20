-- WorkBuddy 抖音作品真实数据模型 V2.0（Cloudflare D1 / SQLite）
ALTER TABLE `collection_logs` ADD `source_file` text;
--> statement-breakpoint
ALTER TABLE `collection_logs` ADD `batch_key` text;
--> statement-breakpoint
ALTER TABLE `collection_logs` ADD `unavailable_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `collection_logs` ADD `raw_payload` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collection_logs_batch_key`
  ON `collection_logs` (`batch_key`) WHERE `batch_key` IS NOT NULL;
--> statement-breakpoint

ALTER TABLE `social_posts` ADD `platform_post_id` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `post_url` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `duration_seconds` real;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `post_type` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `post_status` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `is_pinned` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `content_metadata` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `data_availability_status` text DEFAULT 'unavailable' NOT NULL;
--> statement-breakpoint
UPDATE `social_posts`
SET `post_url` = COALESCE(`post_url`, `video_url`),
    `duration_seconds` = COALESCE(`duration_seconds`, `duration`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_posts_platform_post_id`
  ON `social_posts` (`platform`,`platform_post_id`) WHERE `platform_post_id` IS NOT NULL;
--> statement-breakpoint

CREATE TABLE `social_post_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `platform` text NOT NULL,
  `snapshot_time` text NOT NULL,
  `collection_time` text NOT NULL,
  `play_count` integer,
  `like_count` integer,
  `comment_overview_count` integer,
  `actual_loaded_count` integer,
  `comment_rows_count` integer DEFAULT 0 NOT NULL,
  `favorite_count` integer,
  `share_count` integer,
  `danmaku_count` integer,
  `follower_gain` integer,
  `follower_loss` integer,
  `follower_play_ratio` real,
  `page_entry_rate` real,
  `data_availability_status` text NOT NULL,
  `traffic_availability_status` text NOT NULL,
  `traffic_sources_availability_status` text NOT NULL,
  `audience_availability_status` text NOT NULL,
  `comment_keywords_availability_status` text NOT NULL,
  `comments_availability_status` text NOT NULL,
  `post_age_days` integer NOT NULL,
  `source_file` text NOT NULL,
  `raw_payload` text NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_snapshots_post_time`
  ON `social_post_snapshots` (`post_id`,`snapshot_time`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_snapshots_platform_time`
  ON `social_post_snapshots` (`platform`,`snapshot_time`);
--> statement-breakpoint

CREATE TABLE `social_post_traffic` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer NOT NULL REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_time` text NOT NULL,
  `completion_rate` real,
  `average_play_duration_seconds` real,
  `two_sec_bounce_rate` real,
  `five_sec_completion_rate` real,
  `average_play_ratio` real,
  `cover_click_rate` real,
  `swipe_away_rate` real,
  `page_entry_rate` real,
  `comment_entry_rate` real,
  `text_expand_rate` real,
  `text_completion_rate` real,
  `average_images_viewed` real,
  `like_rate` real,
  `comment_rate` real,
  `share_rate` real,
  `favorite_rate` real,
  `not_interested_rate` real,
  `data_availability_status` text NOT NULL,
  `raw_payload` text NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_traffic_snapshot` ON `social_post_traffic` (`snapshot_id`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_traffic_post_time` ON `social_post_traffic` (`post_id`,`snapshot_time`);
--> statement-breakpoint

CREATE TABLE `social_post_traffic_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer NOT NULL REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_time` text NOT NULL,
  `source_type` text NOT NULL,
  `source_name` text NOT NULL,
  `traffic_value` real,
  `percentage` real,
  `change_percentage` real,
  `traffic_nature` text NOT NULL,
  `raw_value` text,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_traffic_source_snapshot`
  ON `social_post_traffic_sources` (`snapshot_id`,`source_name`,`traffic_nature`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_traffic_source_nature`
  ON `social_post_traffic_sources` (`post_id`,`traffic_nature`,`snapshot_time`);
--> statement-breakpoint

ALTER TABLE `content_audience_analysis` ADD `snapshot_id` integer REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `snapshot_time` text;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `dimension_type` text;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `dimension_name` text;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `dimension_value` real;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `percentage` real;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `ranking` integer;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `raw_value` text;
--> statement-breakpoint
ALTER TABLE `content_audience_analysis` ADD `data_availability_status` text DEFAULT 'available' NOT NULL;
--> statement-breakpoint
DROP INDEX `uq_content_audience_post`;
--> statement-breakpoint
CREATE INDEX `idx_content_audience_post` ON `content_audience_analysis` (`post_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_audience_dimension_snapshot`
  ON `content_audience_analysis` (`snapshot_id`,`dimension_type`,`dimension_name`);
--> statement-breakpoint

CREATE TABLE `social_post_comment_keywords` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer NOT NULL REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_time` text NOT NULL,
  `keyword` text NOT NULL,
  `ranking` integer,
  `occurrence_count` integer,
  `sentiment` text,
  `category` text,
  `data_availability_status` text DEFAULT 'available' NOT NULL,
  `raw_value` text,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_comment_keyword_snapshot`
  ON `social_post_comment_keywords` (`snapshot_id`,`keyword`,`ranking`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_comment_keyword_post_time`
  ON `social_post_comment_keywords` (`post_id`,`snapshot_time`);
--> statement-breakpoint

DROP INDEX `idx_social_comments_post_comment_time`;
--> statement-breakpoint
DROP INDEX `idx_social_comments_sentiment`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_social_comments_user_need`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_social_comments_collection_log_id`;
--> statement-breakpoint
ALTER TABLE `social_comments` RENAME TO `social_comments_legacy_v2`;
--> statement-breakpoint
CREATE TABLE `social_comments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `platform` text NOT NULL,
  `source` text DEFAULT 'system' NOT NULL,
  `source_comment_id` text,
  `comment_fingerprint` text,
  `snapshot_id` integer REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE set null,
  `snapshot_time` text,
  `username` text NOT NULL,
  `comment_text` text,
  `comment_type` text DEFAULT 'text' NOT NULL,
  `comment_time` text,
  `comment_time_raw` text,
  `likes` integer DEFAULT 0 NOT NULL,
  `reply_count` integer DEFAULT 0 NOT NULL,
  `is_author` integer DEFAULT 0 NOT NULL,
  `author_replied` integer,
  `sentiment` text DEFAULT 'unknown' NOT NULL,
  `keyword` text,
  `user_need` text,
  `ai_analysis` text,
  `ai_reply` text,
  `raw_payload` text,
  `data_availability_status` text DEFAULT 'available' NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `social_comments`
  (`id`,`post_id`,`platform`,`source`,`username`,`comment_text`,`comment_type`,`comment_time`,
   `comment_time_raw`,`likes`,`sentiment`,`keyword`,`user_need`,`ai_analysis`,`ai_reply`,
   `collection_log_id`,`created_at`)
SELECT `id`,`post_id`,`platform`,`source`,`username`,`comment_text`,'text',`comment_time`,
  `comment_time`,`likes`,`sentiment`,`keyword`,`user_need`,`ai_analysis`,`ai_reply`,
  `collection_log_id`,`created_at`
FROM `social_comments_legacy_v2`;
--> statement-breakpoint
DROP TABLE `social_comments_legacy_v2`;
--> statement-breakpoint
CREATE INDEX `idx_social_comments_post_comment_time` ON `social_comments` (`post_id`,`comment_time`);
--> statement-breakpoint
CREATE INDEX `idx_social_comments_sentiment` ON `social_comments` (`sentiment`);
--> statement-breakpoint
CREATE INDEX `idx_social_comments_user_need` ON `social_comments` (`user_need`);
--> statement-breakpoint
CREATE INDEX `idx_social_comments_collection_log_id` ON `social_comments` (`collection_log_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_comments_fingerprint`
  ON `social_comments` (`post_id`,`comment_fingerprint`) WHERE `comment_fingerprint` IS NOT NULL;
