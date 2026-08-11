CREATE TABLE `hot_topic_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hot_topic_id` integer NOT NULL,
	`recommended_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`recommended_content` text NOT NULL,
	`social_post_id` integer,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`favorites` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`is_effective` integer,
	`evaluated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hot_topic_id`) REFERENCES `hot_topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`social_post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_feedback_topic_recommended` ON `hot_topic_feedback` (`hot_topic_id`,`recommended_at`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_feedback_social_post` ON `hot_topic_feedback` (`social_post_id`);
--> statement-breakpoint
CREATE INDEX `idx_hot_topic_feedback_effective` ON `hot_topic_feedback` (`is_effective`);
--> statement-breakpoint
PRAGMA optimize;
