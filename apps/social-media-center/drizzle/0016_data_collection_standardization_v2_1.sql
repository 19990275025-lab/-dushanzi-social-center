CREATE TABLE `collection_staging_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `collection_log_id` integer NOT NULL,
  `record_index` integer NOT NULL CHECK (`record_index` >= 0),
  `data_type` text NOT NULL CHECK (`data_type` IN ('hot_topic','content','comment')),
  `platform` text,
  `source` text NOT NULL,
  `normalized_payload` text,
  `raw_payload` text NOT NULL,
  `validation_status` text DEFAULT 'valid' NOT NULL CHECK (`validation_status` IN ('valid','invalid')),
  `validation_errors` text DEFAULT '[]' NOT NULL,
  `confirmed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`collection_log_id`) REFERENCES `collection_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collection_staging_log_index`
  ON `collection_staging_records` (`collection_log_id`,`record_index`);
--> statement-breakpoint
CREATE INDEX `idx_collection_staging_log_status`
  ON `collection_staging_records` (`collection_log_id`,`validation_status`);
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `source` text DEFAULT 'system' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_comments` ADD `source` text DEFAULT 'system' NOT NULL;
