CREATE TABLE `fan_collection_batches` (
	`batch_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`account_id` integer NOT NULL,
	`collection_date` text NOT NULL,
	`source_file` text NOT NULL,
	`data_period` text,
	`raw_metric_count` integer NOT NULL DEFAULT 0,
	`success_metric_count` integer NOT NULL DEFAULT 0,
	`unavailable_metric_count` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'pending',
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fan_collection_batch_source` ON `fan_collection_batches` (`platform`,`account_id`,`source_file`);
--> statement-breakpoint
CREATE INDEX `idx_fan_collection_batch_date` ON `fan_collection_batches` (`platform`,`collection_date`);
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `account_name` text;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `snapshot_date` text;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `display_fans_count` text;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `male_ratio` real;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `female_ratio` real;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `collection_time` text;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `data_period` text;
--> statement-breakpoint
ALTER TABLE `social_fans` ADD `batch_id` integer REFERENCES `fan_collection_batches`(`batch_id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_fans_batch` ON `social_fans` (`batch_id`) WHERE `batch_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `fan_profile_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`platform` text NOT NULL,
	`account_id` integer NOT NULL,
	`snapshot_date` text NOT NULL,
	`dimension_type` text NOT NULL,
	`dimension_name` text NOT NULL,
	`dimension_value` real,
	`percentage` real,
	`ranking` integer,
	`raw_value` text,
	`collection_time` text NOT NULL,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`batch_id`) REFERENCES `fan_collection_batches`(`batch_id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fan_profile_batch_dimension` ON `fan_profile_records` (`batch_id`,`dimension_type`,`dimension_name`);
--> statement-breakpoint
CREATE INDEX `idx_fan_profile_account_snapshot` ON `fan_profile_records` (`account_id`,`snapshot_date`);
--> statement-breakpoint
CREATE INDEX `idx_fan_profile_type_snapshot` ON `fan_profile_records` (`platform`,`dimension_type`,`snapshot_date`);
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `batch_id` integer REFERENCES `fan_collection_batches`(`batch_id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `snapshot_date` text;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `period_type` text NOT NULL DEFAULT 'daily';
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `period_start` text;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `period_end` text;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `new_followers` integer;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `lost_followers` integer;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `returning_followers` integer;
--> statement-breakpoint
ALTER TABLE `fan_growth_records` ADD `collection_time` text;
--> statement-breakpoint
UPDATE `fan_growth_records` SET
	`snapshot_date` = COALESCE(`snapshot_date`, `record_date`),
	`period_type` = CASE WHEN json_extract(`raw_payload`, '$.granularity') = 'period_summary' THEN 'custom' ELSE COALESCE(`period_type`, 'daily') END,
	`period_end` = COALESCE(`period_end`, `record_date`),
	`new_followers` = COALESCE(`new_followers`, `new_fans`),
	`lost_followers` = COALESCE(`lost_followers`, `lost_fans`),
	`returning_followers` = COALESCE(`returning_followers`, json_extract(`raw_payload`, '$.returningFans')),
	`collection_time` = COALESCE(`collection_time`, `updated_at`, `created_at`);
--> statement-breakpoint
DROP INDEX IF EXISTS `uq_fan_growth_account_date`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fan_growth_batch_period` ON `fan_growth_records` (`batch_id`,`period_type`) WHERE `batch_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_fan_growth_platform_period` ON `fan_growth_records` (`platform`,`period_type`,`period_end`);
