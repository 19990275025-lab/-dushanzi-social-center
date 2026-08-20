-- 独山子大峡谷 AI 营销中台：粉丝数据模型 V2.0
-- PostgreSQL 兼容设计；当前 Sites 运行库由 D1 迁移负责。

BEGIN;

CREATE TABLE IF NOT EXISTS fan_collection_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    account_id UUID NOT NULL REFERENCES social_accounts (id) ON UPDATE CASCADE ON DELETE CASCADE,
    collection_date DATE NOT NULL,
    source_file VARCHAR(512) NOT NULL,
    data_period JSONB,
    raw_metric_count INTEGER NOT NULL DEFAULT 0,
    success_metric_count INTEGER NOT NULL DEFAULT 0,
    unavailable_metric_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fan_collection_batch_source UNIQUE (platform, account_id, source_file),
    CONSTRAINT ck_fan_collection_batch_status CHECK (status IN ('pending', 'completed', 'failed'))
);

ALTER TABLE social_fans
    ADD COLUMN IF NOT EXISTS account_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS snapshot_date DATE,
    ADD COLUMN IF NOT EXISTS display_fans_count VARCHAR(64),
    ADD COLUMN IF NOT EXISTS male_ratio NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS female_ratio NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS collection_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS data_period JSONB,
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES fan_collection_batches (batch_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_fans_batch ON social_fans (batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fan_profile_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES fan_collection_batches (batch_id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    account_id UUID NOT NULL REFERENCES social_accounts (id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    dimension_type VARCHAR(32) NOT NULL,
    dimension_name VARCHAR(255) NOT NULL,
    dimension_value NUMERIC,
    percentage NUMERIC(6,2),
    ranking INTEGER,
    raw_value TEXT,
    collection_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fan_profile_batch_dimension UNIQUE (batch_id, dimension_type, dimension_name),
    CONSTRAINT ck_fan_profile_dimension_type CHECK (dimension_type IN ('gender','age','region','interest','device','activity','follow_keyword','other'))
);

ALTER TABLE fan_growth_records
    DROP CONSTRAINT IF EXISTS uq_fan_growth_account_date,
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES fan_collection_batches (batch_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS snapshot_date DATE,
    ADD COLUMN IF NOT EXISTS period_type VARCHAR(32) NOT NULL DEFAULT 'daily',
    ADD COLUMN IF NOT EXISTS period_start DATE,
    ADD COLUMN IF NOT EXISTS period_end DATE,
    ADD COLUMN IF NOT EXISTS new_followers BIGINT,
    ADD COLUMN IF NOT EXISTS lost_followers BIGINT,
    ADD COLUMN IF NOT EXISTS returning_followers BIGINT,
    ADD COLUMN IF NOT EXISTS collection_time TIMESTAMPTZ;

UPDATE fan_growth_records SET
    snapshot_date = COALESCE(snapshot_date, record_date),
    period_end = COALESCE(period_end, record_date),
    new_followers = COALESCE(new_followers, new_fans),
    lost_followers = COALESCE(lost_followers, lost_fans),
    collection_time = COALESCE(collection_time, updated_at, created_at)
WHERE snapshot_date IS NULL OR period_end IS NULL OR new_followers IS NULL
   OR lost_followers IS NULL OR collection_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_growth_batch_period
    ON fan_growth_records (batch_id, period_type) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fan_growth_platform_period
    ON fan_growth_records (platform, period_type, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_fan_profile_account_snapshot
    ON fan_profile_records (account_id, snapshot_date DESC);

COMMIT;
