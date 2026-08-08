-- 独山子大峡谷 AI 营销中台：内容与用户洞察中心 V1.0
-- 数据库：PostgreSQL 14+
-- 范围：仅新增新媒体粉丝数据对象，不修改任何 OTA 表或对象。

BEGIN;

CREATE TABLE IF NOT EXISTS social_fans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES social_accounts (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    fans_count BIGINT NOT NULL DEFAULT 0,
    gender_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    age_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    region_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    interest_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    active_time_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_type VARCHAR(32) NOT NULL DEFAULT 'api',
    source_record_id VARCHAR(255),
    raw_payload JSONB,
    collection_log_id UUID,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_social_fans_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_social_fans_count CHECK (fans_count >= 0),
    CONSTRAINT ck_social_fans_source_type
        CHECK (source_type IN ('chrome', 'excel', 'api', 'manual')),
    CONSTRAINT uq_social_fans_source_record
        UNIQUE (platform, source_record_id)
);

CREATE TABLE IF NOT EXISTS fan_growth_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES social_accounts (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    record_date DATE NOT NULL,
    fans_count BIGINT NOT NULL DEFAULT 0,
    net_growth BIGINT NOT NULL DEFAULT 0,
    new_fans BIGINT NOT NULL DEFAULT 0,
    lost_fans BIGINT NOT NULL DEFAULT 0,
    source_type VARCHAR(32) NOT NULL DEFAULT 'api',
    source_record_id VARCHAR(255),
    raw_payload JSONB,
    collection_log_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_fan_growth_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_fan_growth_fans_count CHECK (fans_count >= 0),
    CONSTRAINT ck_fan_growth_new_fans CHECK (new_fans >= 0),
    CONSTRAINT ck_fan_growth_lost_fans CHECK (lost_fans >= 0),
    CONSTRAINT ck_fan_growth_source_type
        CHECK (source_type IN ('chrome', 'excel', 'api', 'manual')),
    CONSTRAINT uq_fan_growth_account_date UNIQUE (account_id, record_date),
    CONSTRAINT uq_fan_growth_source_record UNIQUE (platform, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_social_fans_account_collected_at
    ON social_fans (account_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_fans_platform_collected_at
    ON social_fans (platform, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_growth_platform_date
    ON fan_growth_records (platform, record_date DESC);

COMMENT ON TABLE social_fans IS '内容与用户洞察中心：平台粉丝画像快照';
COMMENT ON TABLE fan_growth_records IS '内容与用户洞察中心：账号粉丝增长时间序列';
COMMENT ON COLUMN social_fans.raw_payload IS '未来自动采集保留的原始平台响应';
COMMENT ON COLUMN fan_growth_records.raw_payload IS '未来自动采集保留的原始平台响应';

COMMIT;
