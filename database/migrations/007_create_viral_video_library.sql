-- 独山子大峡谷 AI 营销中台：爆款视频数据库
-- 按内容赛道分析，不绑定固定景区账号，不修改 OTA 数据对象。

BEGIN;

CREATE TABLE IF NOT EXISTS viral_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    category VARCHAR(32) NOT NULL,
    account_name VARCHAR(255),
    title TEXT NOT NULL,
    publish_time TIMESTAMPTZ NOT NULL,
    video_url TEXT,
    views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes BIGINT NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments BIGINT NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites BIGINT NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares BIGINT NOT NULL DEFAULT 0 CHECK (shares >= 0),
    video_structure TEXT,
    title_pattern TEXT,
    first_three_seconds TEXT,
    shooting_method TEXT,
    interaction_method TEXT,
    comment_feedback TEXT,
    breakout_reason TEXT,
    replicable_elements TEXT,
    dushanzi_suggestion TEXT,
    source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
    source_record_id VARCHAR(255),
    raw_payload JSONB,
    collection_log_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_viral_videos_platform CHECK (platform IN ('douyin', 'kuaishou', 'weibo')),
    CONSTRAINT ck_viral_videos_category CHECK (category IN ('tourism', 'scenic', 'xinjiang', 'nature')),
    CONSTRAINT ck_viral_videos_source_type CHECK (source_type IN ('chrome', 'excel', 'api', 'manual')),
    CONSTRAINT uq_viral_videos_source_record UNIQUE (platform, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_viral_videos_category_publish_time
    ON viral_videos (category, publish_time DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_platform_views
    ON viral_videos (platform, views DESC);

COMMENT ON TABLE viral_videos IS '旅游、景区、新疆旅游和自然风景爆款视频样本库';
COMMENT ON COLUMN viral_videos.account_name IS '可选来源账号，不作为固定对标维度';
COMMENT ON COLUMN viral_videos.raw_payload IS '未来自动采集保留的原始平台响应';

COMMIT;
