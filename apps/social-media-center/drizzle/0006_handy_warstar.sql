CREATE TABLE `fan_growth_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`platform` text NOT NULL,
	`record_date` text NOT NULL,
	`fans_count` integer DEFAULT 0 NOT NULL,
	`net_growth` integer DEFAULT 0 NOT NULL,
	`new_fans` integer DEFAULT 0 NOT NULL,
	`lost_fans` integer DEFAULT 0 NOT NULL,
	`source_type` text DEFAULT 'api' NOT NULL,
	`source_record_id` text,
	`raw_payload` text,
	`collection_log_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`collection_log_id`) REFERENCES `collection_logs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fan_growth_account_date` ON `fan_growth_records` (`account_id`,`record_date`);--> statement-breakpoint
CREATE INDEX `idx_fan_growth_platform_date` ON `fan_growth_records` (`platform`,`record_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fan_growth_source_record` ON `fan_growth_records` (`platform`,`source_record_id`);--> statement-breakpoint
CREATE TABLE `social_fans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`platform` text NOT NULL,
	`fans_count` integer DEFAULT 0 NOT NULL,
	`gender_distribution` text DEFAULT '[]' NOT NULL,
	`age_distribution` text DEFAULT '[]' NOT NULL,
	`region_distribution` text DEFAULT '[]' NOT NULL,
	`interest_distribution` text DEFAULT '[]' NOT NULL,
	`active_time_distribution` text DEFAULT '[]' NOT NULL,
	`source_type` text DEFAULT 'api' NOT NULL,
	`source_record_id` text,
	`raw_payload` text,
	`collection_log_id` integer,
	`collected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`collection_log_id`) REFERENCES `collection_logs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_social_fans_account_collected_at` ON `social_fans` (`account_id`,`collected_at`);--> statement-breakpoint
CREATE INDEX `idx_social_fans_platform_collected_at` ON `social_fans` (`platform`,`collected_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_social_fans_source_record` ON `social_fans` (`platform`,`source_record_id`);