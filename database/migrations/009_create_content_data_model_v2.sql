-- 独山子大峡谷 AI 营销中台：作品数据模型 V2.0
-- PostgreSQL 兼容设计；当前 Sites 运行库由 D1 迁移负责。

BEGIN;

ALTER TABLE collection_logs
  ADD COLUMN IF NOT EXISTS source_file TEXT,
  ADD COLUMN IF NOT EXISTS batch_key TEXT,
  ADD COLUMN IF NOT EXISTS unavailable_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_logs_batch_key
  ON collection_logs (batch_key) WHERE batch_key IS NOT NULL;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS platform_post_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS post_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS post_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS post_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS content_metadata JSONB,
  ADD COLUMN IF NOT EXISTS data_availability_status VARCHAR(32) NOT NULL DEFAULT 'unavailable';

UPDATE social_posts SET
  post_url = COALESCE(post_url, video_url),
  duration_seconds = COALESCE(duration_seconds, duration);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_posts_platform_post_id
  ON social_posts (platform, platform_post_id) WHERE platform_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS social_post_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  platform VARCHAR(32) NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL,
  collection_time TIMESTAMPTZ NOT NULL,
  play_count BIGINT, like_count BIGINT, comment_overview_count BIGINT,
  actual_loaded_count BIGINT, comment_rows_count BIGINT NOT NULL DEFAULT 0,
  favorite_count BIGINT, share_count BIGINT, danmaku_count BIGINT,
  follower_gain BIGINT, follower_loss BIGINT,
  follower_play_ratio NUMERIC, page_entry_rate NUMERIC,
  data_availability_status VARCHAR(32) NOT NULL,
  traffic_availability_status VARCHAR(32) NOT NULL,
  traffic_sources_availability_status VARCHAR(32) NOT NULL,
  audience_availability_status VARCHAR(32) NOT NULL,
  comment_keywords_availability_status VARCHAR(32) NOT NULL,
  comments_availability_status VARCHAR(32) NOT NULL,
  post_age_days INTEGER NOT NULL,
  source_file TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  collection_log_id UUID REFERENCES collection_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (post_id, snapshot_time)
);

CREATE TABLE IF NOT EXISTS social_post_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  snapshot_id UUID NOT NULL UNIQUE REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
  snapshot_time TIMESTAMPTZ NOT NULL,
  completion_rate NUMERIC, average_play_duration_seconds NUMERIC,
  two_sec_bounce_rate NUMERIC, five_sec_completion_rate NUMERIC,
  average_play_ratio NUMERIC, cover_click_rate NUMERIC, swipe_away_rate NUMERIC,
  page_entry_rate NUMERIC, comment_entry_rate NUMERIC, text_expand_rate NUMERIC,
  text_completion_rate NUMERIC, average_images_viewed NUMERIC,
  like_rate NUMERIC, comment_rate NUMERIC, share_rate NUMERIC, favorite_rate NUMERIC,
  not_interested_rate NUMERIC,
  data_availability_status VARCHAR(32) NOT NULL,
  raw_payload JSONB NOT NULL,
  collection_log_id UUID REFERENCES collection_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_post_traffic_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
  snapshot_time TIMESTAMPTZ NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  traffic_value NUMERIC, percentage NUMERIC, change_percentage NUMERIC,
  traffic_nature VARCHAR(16) NOT NULL CHECK (traffic_nature IN ('organic','paid','other')),
  raw_value TEXT,
  collection_log_id UUID REFERENCES collection_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (snapshot_id, source_name, traffic_nature)
);

ALTER TABLE content_audience_analysis
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS snapshot_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dimension_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS dimension_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dimension_value NUMERIC,
  ADD COLUMN IF NOT EXISTS percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS ranking INTEGER,
  ADD COLUMN IF NOT EXISTS raw_value TEXT,
  ADD COLUMN IF NOT EXISTS data_availability_status VARCHAR(32) NOT NULL DEFAULT 'available';

DROP INDEX IF EXISTS uq_content_audience_post;
CREATE INDEX IF NOT EXISTS idx_content_audience_post ON content_audience_analysis(post_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_audience_dimension_snapshot
  ON content_audience_analysis(snapshot_id, dimension_type, dimension_name);

CREATE TABLE IF NOT EXISTS social_post_comment_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
  snapshot_time TIMESTAMPTZ NOT NULL,
  keyword TEXT NOT NULL,
  ranking INTEGER, occurrence_count INTEGER, sentiment VARCHAR(32), category VARCHAR(64),
  data_availability_status VARCHAR(32) NOT NULL DEFAULT 'available',
  raw_value TEXT,
  collection_log_id UUID REFERENCES collection_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (snapshot_id, keyword, ranking)
);

ALTER TABLE social_comments
  ALTER COLUMN comment_text DROP NOT NULL,
  ALTER COLUMN comment_time DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_comment_id TEXT,
  ADD COLUMN IF NOT EXISTS comment_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comment_type VARCHAR(16) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS comment_time_raw TEXT,
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_author BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS author_replied BOOLEAN,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS data_availability_status VARCHAR(32) NOT NULL DEFAULT 'available';

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_comments_fingerprint
  ON social_comments(post_id, comment_fingerprint) WHERE comment_fingerprint IS NOT NULL;

COMMIT;
