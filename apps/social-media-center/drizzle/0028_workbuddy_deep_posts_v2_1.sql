ALTER TABLE `social_post_snapshots` ADD `source_record_status` text DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_post_snapshots` ADD `source_failure_reason` text;
--> statement-breakpoint
ALTER TABLE `social_comments` ADD `likes_availability_status` text DEFAULT 'available' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_comments` ADD `likes_raw_value` text;
--> statement-breakpoint
CREATE TABLE `content_collection_files` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `file_name` text NOT NULL,
  `full_path` text NOT NULL,
  `checksum` text NOT NULL,
  `file_size` integer NOT NULL,
  `collection_date` text,
  `collection_time` text,
  `collection_batch` text,
  `actual_post_count` integer DEFAULT 0 NOT NULL,
  `completeness_score` real,
  `detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `validated_at` text,
  `processed_at` text,
  `status` text DEFAULT 'detected' NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `metadata` text,
  `error_message` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_collection_files_checksum` ON `content_collection_files` (`checksum`);
--> statement-breakpoint
CREATE INDEX `idx_content_collection_files_status_time` ON `content_collection_files` (`status`,`collection_time`);
--> statement-breakpoint
CREATE TABLE `social_post_metric_series` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer NOT NULL REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_time` text NOT NULL,
  `metric_type` text NOT NULL,
  `series_name` text NOT NULL,
  `point_index` integer NOT NULL,
  `point_time` text,
  `point_label` text,
  `metric_value` real,
  `unit` text,
  `source_path` text NOT NULL,
  `raw_value` text,
  `data_availability_status` text DEFAULT 'available' NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_metric_series_point` ON `social_post_metric_series` (`snapshot_id`,`metric_type`,`series_name`,`point_index`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_metric_series_post_type_time` ON `social_post_metric_series` (`post_id`,`metric_type`,`point_time`);
--> statement-breakpoint
CREATE TABLE `social_post_paid_traffic` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer NOT NULL REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_time` text NOT NULL,
  `campaign_type` text NOT NULL,
  `play_count` integer,
  `relationship_to_overview` text DEFAULT 'unknown' NOT NULL,
  `detail_available` integer,
  `data_availability_status` text NOT NULL,
  `raw_payload` text NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_paid_traffic_snapshot_type` ON `social_post_paid_traffic` (`snapshot_id`,`campaign_type`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_paid_traffic_post_time` ON `social_post_paid_traffic` (`post_id`,`snapshot_time`);
--> statement-breakpoint
CREATE TABLE `social_post_audience` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer NOT NULL REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_time` text NOT NULL,
  `dimension_type` text NOT NULL,
  `dimension_name` text NOT NULL,
  `dimension_value` real,
  `percentage` real,
  `ranking` integer,
  `raw_value` text,
  `data_availability_status` text NOT NULL,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_post_audience_snapshot_dimension` ON `social_post_audience` (`snapshot_id`,`dimension_type`,`dimension_name`);
--> statement-breakpoint
CREATE INDEX `idx_social_post_audience_post_type` ON `social_post_audience` (`post_id`,`dimension_type`);
--> statement-breakpoint
CREATE TABLE `social_comment_replies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comment_id` integer NOT NULL REFERENCES `social_comments`(`id`) ON UPDATE cascade ON DELETE cascade,
  `post_id` integer NOT NULL REFERENCES `social_posts`(`id`) ON UPDATE cascade ON DELETE cascade,
  `snapshot_id` integer REFERENCES `social_post_snapshots`(`id`) ON UPDATE cascade ON DELETE set null,
  `source_reply_id` text,
  `reply_fingerprint` text NOT NULL,
  `username` text NOT NULL,
  `reply_text` text,
  `reply_type` text DEFAULT 'text' NOT NULL,
  `reply_time` text,
  `reply_time_raw` text,
  `likes` integer,
  `is_author` integer,
  `data_availability_status` text DEFAULT 'available' NOT NULL,
  `raw_payload` text,
  `collection_log_id` integer REFERENCES `collection_logs`(`id`) ON DELETE set null,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_comment_replies_fingerprint` ON `social_comment_replies` (`comment_id`,`reply_fingerprint`);
--> statement-breakpoint
CREATE INDEX `idx_social_comment_replies_post` ON `social_comment_replies` (`post_id`,`reply_time`);
