CREATE TABLE `data_import_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`file_name` text NOT NULL,
	`import_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_data_import_logs_created_at` ON `data_import_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_data_import_logs_status` ON `data_import_logs` (`status`);--> statement-breakpoint
ALTER TABLE `social_posts` ADD `import_log_id` integer REFERENCES data_import_logs(id);--> statement-breakpoint
CREATE INDEX `idx_social_posts_import_log_id` ON `social_posts` (`import_log_id`);