CREATE TABLE `content_plans` (
  `plan_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `hot_topic_id` integer NOT NULL,
  `task_id` integer,
  `related_post_id` integer,
  `platform` text DEFAULT 'douyin' NOT NULL CHECK (`platform` = 'douyin'),
  `content_type` text NOT NULL CHECK (`content_type` IN ('guide','scenery','visitor_experience','challenge','live')),
  `title` text NOT NULL,
  `title_options` text DEFAULT '[]' NOT NULL,
  `script` text NOT NULL,
  `shot_list` text DEFAULT '[]' NOT NULL,
  `cover_text` text NOT NULL,
  `hashtags` text DEFAULT '[]' NOT NULL,
  `recommended_topics` text DEFAULT '[]' NOT NULL,
  `background_music` text,
  `publish_time` text NOT NULL,
  `live_theme` text,
  `target_views` integer DEFAULT 0 NOT NULL CHECK (`target_views` >= 0),
  `target_interaction_rate` real DEFAULT 0 NOT NULL CHECK (`target_interaction_rate` >= 0),
  `target_fans_growth` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL CHECK (`status` IN ('draft','task_created','published','reviewed')),
  `created_time` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_time` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`hot_topic_id`) REFERENCES `hot_topics`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`task_id`) REFERENCES `content_tasks`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`related_post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_plans_topic_platform` ON `content_plans` (`hot_topic_id`,`platform`);
--> statement-breakpoint
CREATE INDEX `idx_content_plans_status_publish_time` ON `content_plans` (`status`,`publish_time`);
--> statement-breakpoint
CREATE INDEX `idx_content_plans_task_id` ON `content_plans` (`task_id`);
--> statement-breakpoint
CREATE INDEX `idx_content_plans_related_post_id` ON `content_plans` (`related_post_id`);
--> statement-breakpoint
CREATE TABLE `content_plan_feedback` (
  `plan_id` integer PRIMARY KEY NOT NULL,
  `post_id` integer NOT NULL,
  `views` integer DEFAULT 0 NOT NULL CHECK (`views` >= 0),
  `likes` integer DEFAULT 0 NOT NULL CHECK (`likes` >= 0),
  `comments` integer DEFAULT 0 NOT NULL CHECK (`comments` >= 0),
  `favorites` integer DEFAULT 0 NOT NULL CHECK (`favorites` >= 0),
  `shares` integer DEFAULT 0 NOT NULL CHECK (`shares` >= 0),
  `effect_score` real DEFAULT 0 NOT NULL CHECK (`effect_score` >= 0 AND `effect_score` <= 100),
  `ai_summary` text NOT NULL,
  `evaluated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plan_id`) REFERENCES `content_plans`(`plan_id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_plan_feedback_post_id` ON `content_plan_feedback` (`post_id`);
--> statement-breakpoint
CREATE INDEX `idx_content_plan_feedback_effect_score` ON `content_plan_feedback` (`effect_score`);
--> statement-breakpoint
PRAGMA optimize;
