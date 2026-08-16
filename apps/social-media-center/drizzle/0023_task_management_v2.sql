ALTER TABLE `content_tasks` ADD `collaborators` text NOT NULL DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `source_type` text NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `source_id` integer;--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `priority` text NOT NULL DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `related_post_id` integer REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `updated_at` text;--> statement-breakpoint
UPDATE `content_tasks` SET `status` = CASE `status`
  WHEN 'idea' THEN 'planning'
  WHEN 'approved' THEN 'shoot_pending'
  WHEN 'in_production' THEN 'shooting'
  WHEN 'review' THEN 'review_pending'
  WHEN 'scheduled' THEN 'publish_pending'
  WHEN 'done' THEN 'reviewed'
  WHEN 'blocked' THEN 'planning'
  WHEN 'cancelled' THEN 'planning'
  ELSE `status` END;--> statement-breakpoint
UPDATE `content_tasks` SET `updated_at` = COALESCE(`updated_at`, `created_at`, CURRENT_TIMESTAMP);--> statement-breakpoint
CREATE INDEX `idx_content_tasks_source` ON `content_tasks` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_content_tasks_related_post` ON `content_tasks` (`related_post_id`);
