-- 独山子大峡谷 AI 营销中台：内容监测中心 V1.0
-- 仅新增新媒体竞品作品数据，不修改 OTA 数据对象。

BEGIN;

CREATE TABLE IF NOT EXISTS competitor_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    publish_time TIMESTAMPTZ NOT NULL,
    views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes BIGINT NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments BIGINT NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites BIGINT NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares BIGINT NOT NULL DEFAULT 0 CHECK (shares >= 0),
    source_type VARCHAR(32) NOT NULL DEFAULT 'api',
    source_record_id VARCHAR(255),
    raw_payload JSONB,
    collection_log_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_competitor_posts_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT uq_competitor_posts_source_record UNIQUE (platform, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_posts_platform_publish_time
    ON competitor_posts (platform, publish_time DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_posts_account_publish_time
    ON competitor_posts (account_name, publish_time DESC);

COMMENT ON TABLE competitor_posts IS '内容监测中心：同行账号作品指标';
COMMENT ON COLUMN competitor_posts.raw_payload IS '未来自动采集保留的原始平台响应';

COMMIT;
