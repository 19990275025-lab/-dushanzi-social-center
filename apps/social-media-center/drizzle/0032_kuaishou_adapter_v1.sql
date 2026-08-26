-- Generated with drizzle-kit; reviewed for D1 FK-safe, row-preserving nullable comments.
-- Back up both databases before applying. No business row is discarded.
DROP INDEX `uq_social_post_traffic_source_snapshot`;
--> statement-breakpoint

ALTER TABLE `social_post_traffic_sources` ADD `metric_dimension` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_social_post_traffic_source_snapshot` ON `social_post_traffic_sources` (`snapshot_id`,`metric_dimension`,`source_name`,`traffic_nature`);
--> statement-breakpoint

DROP INDEX `uq_social_posts_account_title`;
--> statement-breakpoint

DROP INDEX `uq_social_posts_platform_post_id`;
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_social_posts_account_title` ON `social_posts` (`account_id`,`title`) WHERE "social_posts"."platform" <> 'kuaishou' OR "social_posts"."platform_post_id" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_social_posts_platform_post_id` ON `social_posts` (`platform`,`account_id`,`platform_post_id`);
--> statement-breakpoint

ALTER TABLE `social_comments` ADD `field_availability` text;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `platform` text;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `model_version` text;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `promotion_status` text;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `promotion_type` text;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `natural_performance_confidence` text;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `viewing_score` real;
--> statement-breakpoint

ALTER TABLE `social_post_evaluations` ADD `follower_score` real;
--> statement-breakpoint

ALTER TABLE `social_post_metric_series` ADD `source_platform` text;
--> statement-breakpoint

ALTER TABLE `social_post_paid_traffic` ADD `promotion_type` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint

ALTER TABLE `social_post_paid_traffic` ADD `promotion_source` text;
--> statement-breakpoint

ALTER TABLE `social_post_paid_traffic` ADD `promotion_present` integer;
--> statement-breakpoint
-- BEGIN_NULLABLE_COMMENTS
CREATE TABLE __ks_reply_preservation AS SELECT * FROM social_comment_replies;
--> statement-breakpoint
CREATE TABLE __ks_comment_sequence AS SELECT seq FROM sqlite_sequence WHERE name='social_comments';
--> statement-breakpoint
CREATE TABLE __new_social_comments_ks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
        source TEXT NOT NULL DEFAULT 'system',
        source_comment_id TEXT,
        comment_fingerprint TEXT,
        snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL,
        snapshot_time TEXT,
        username TEXT,
        comment_text TEXT,
        comment_type TEXT NOT NULL DEFAULT 'text' CHECK (comment_type IN ('text','image','emoji','mixed','other')),
        comment_time TEXT,
        comment_time_raw TEXT,
        likes INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0 CHECK (reply_count >= 0),
        is_author INTEGER NOT NULL DEFAULT 0 CHECK (is_author IN (0, 1)),
        author_replied INTEGER CHECK (author_replied IS NULL OR author_replied IN (0, 1)),
        sentiment TEXT NOT NULL DEFAULT 'unknown',
        keyword TEXT,
        user_need TEXT,
        ai_analysis TEXT,
        ai_reply TEXT,
        raw_payload TEXT,
        data_availability_status TEXT NOT NULL DEFAULT 'available'
          CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
        collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      , likes_availability_status TEXT NOT NULL DEFAULT 'available', likes_raw_value TEXT, field_availability TEXT);
--> statement-breakpoint
INSERT INTO __new_social_comments_ks (id,post_id,platform,source,source_comment_id,comment_fingerprint,snapshot_id,snapshot_time,username,comment_text,comment_type,comment_time,comment_time_raw,likes,reply_count,is_author,author_replied,sentiment,keyword,user_need,ai_analysis,ai_reply,raw_payload,data_availability_status,collection_log_id,created_at,likes_availability_status,likes_raw_value,field_availability) SELECT id,post_id,platform,source,source_comment_id,comment_fingerprint,snapshot_id,snapshot_time,username,comment_text,comment_type,comment_time,comment_time_raw,likes,reply_count,is_author,author_replied,sentiment,keyword,user_need,ai_analysis,ai_reply,raw_payload,data_availability_status,collection_log_id,created_at,likes_availability_status,likes_raw_value,field_availability FROM social_comments;
--> statement-breakpoint
DROP TABLE social_comments;
--> statement-breakpoint
ALTER TABLE __new_social_comments_ks RENAME TO social_comments;
--> statement-breakpoint
INSERT OR IGNORE INTO social_comment_replies SELECT * FROM __ks_reply_preservation;
--> statement-breakpoint
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM __ks_comment_sequence LIMIT 1), seq)) WHERE name='social_comments';
--> statement-breakpoint
DROP TABLE __ks_reply_preservation;
--> statement-breakpoint
DROP TABLE __ks_comment_sequence;
--> statement-breakpoint
CREATE INDEX idx_social_comments_collection_log_id ON social_comments(collection_log_id);
--> statement-breakpoint
CREATE INDEX idx_social_comments_user_need ON social_comments(user_need);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_social_comments_fingerprint ON social_comments(post_id, comment_fingerprint) WHERE comment_fingerprint IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_social_comments_post_comment_time
    ON social_comments(post_id, comment_time DESC);
--> statement-breakpoint
CREATE INDEX idx_social_comments_sentiment
    ON social_comments(sentiment);
--> statement-breakpoint
-- END_NULLABLE_COMMENTS
UPDATE social_post_metric_series SET source_platform = (SELECT platform FROM social_posts WHERE id = post_id) WHERE source_platform IS NULL;
--> statement-breakpoint
UPDATE social_post_traffic_sources SET metric_dimension = 'play' WHERE metric_dimension='unknown' AND source_type IN ('platform_page','extra_traffic') AND (traffic_value IS NOT NULL OR percentage IS NOT NULL) AND post_id IN (SELECT id FROM social_posts WHERE platform='douyin');
--> statement-breakpoint
UPDATE social_post_paid_traffic SET promotion_type='paid', promotion_source='dou_plus', promotion_present=1 WHERE promotion_source IS NULL AND post_id IN (SELECT id FROM social_posts WHERE platform='douyin') AND (campaign_type LIKE '%DOU%' OR campaign_type LIKE '%dou%');
--> statement-breakpoint
UPDATE social_post_evaluations SET platform=(SELECT platform FROM social_posts WHERE id=post_id) WHERE platform IS NULL;
--> statement-breakpoint
UPDATE social_post_evaluations SET model_version='douyin-content-effect-rules-v1', promotion_status=douyin_paid_status, promotion_type=CASE WHEN douyin_paid_status='none' THEN 'organic' ELSE 'paid' END, natural_performance_confidence=CASE WHEN json_valid(raw_evaluation) THEN json_extract(raw_evaluation,'$.naturalPerformanceConfidence') ELSE NULL END WHERE platform='douyin' AND model_version IS NULL;
