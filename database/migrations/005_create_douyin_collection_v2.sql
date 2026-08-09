-- 独山子大峡谷 AI 营销中台：抖音智能采集中心 V2.0
-- 仅扩展新媒体数据对象，不修改 OTA 表或对象。

BEGIN;

ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS completion_rate NUMERIC(6, 3),
    ADD COLUMN IF NOT EXISTS average_play_duration NUMERIC(10, 3),
    ADD COLUMN IF NOT EXISTS traffic_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS content_audience_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES social_posts (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    gender_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    age_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    region_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_type VARCHAR(32) NOT NULL DEFAULT 'api',
    source_record_id VARCHAR(255),
    raw_payload JSONB,
    collection_log_id UUID,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_content_audience_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT uq_content_audience_post UNIQUE (post_id),
    CONSTRAINT uq_content_audience_source_record UNIQUE (platform, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_content_audience_platform_collected_at
    ON content_audience_analysis (platform, collected_at DESC);

COMMENT ON TABLE content_audience_analysis IS '作品级观众年龄、地域和性别画像';
COMMENT ON COLUMN social_posts.traffic_sources IS '作品流量来源占比，JSON 数组';

COMMIT;
