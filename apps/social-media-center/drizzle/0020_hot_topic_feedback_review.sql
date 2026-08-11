ALTER TABLE `hot_topic_feedback` ADD `related_post_id` integer REFERENCES `social_posts`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `hot_topic_feedback` ADD `platform` text;
--> statement-breakpoint
ALTER TABLE `hot_topic_feedback` ADD `publish_time` text;
--> statement-breakpoint
ALTER TABLE `hot_topic_feedback` ADD `effect_score` real;
--> statement-breakpoint
ALTER TABLE `hot_topic_feedback` ADD `ai_summary` text;
--> statement-breakpoint
UPDATE `hot_topic_feedback`
SET `related_post_id` = `social_post_id`
WHERE `related_post_id` IS NULL AND `social_post_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `hot_topic_feedback`
SET `platform` = (SELECT `platform` FROM `hot_topics` WHERE `hot_topics`.`id` = `hot_topic_feedback`.`hot_topic_id`)
WHERE `platform` IS NULL OR trim(`platform`) = '';
--> statement-breakpoint
UPDATE `hot_topic_feedback`
SET `publish_time` = (SELECT `publish_time` FROM `social_posts` WHERE `social_posts`.`id` = `hot_topic_feedback`.`related_post_id`)
WHERE `publish_time` IS NULL AND `related_post_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_feedback_related_post` ON `hot_topic_feedback` (`related_post_id`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_feedback_platform_publish` ON `hot_topic_feedback` (`platform`,`publish_time`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_feedback_effect_score` ON `hot_topic_feedback` (`effect_score`);
--> statement-breakpoint
PRAGMA optimize;
