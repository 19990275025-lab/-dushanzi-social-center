CREATE TABLE `competitor_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`account_name` text NOT NULL,
	`title` text NOT NULL,
	`publish_time` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`favorites` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`source_type` text DEFAULT 'api' NOT NULL,
	`source_record_id` text,
	`raw_payload` text,
	`collection_log_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`collection_log_id`) REFERENCES `collection_logs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_competitor_posts_platform_publish_time` ON `competitor_posts` (`platform`,`publish_time`);
--> statement-breakpoint
CREATE INDEX `idx_competitor_posts_account_publish_time` ON `competitor_posts` (`account_name`,`publish_time`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_competitor_posts_source_record` ON `competitor_posts` (`platform`,`source_record_id`);
