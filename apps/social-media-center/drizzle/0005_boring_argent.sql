ALTER TABLE `social_comments` ADD `ai_analysis` text;--> statement-breakpoint
CREATE INDEX `idx_social_comments_user_need` ON `social_comments` (`user_need`);