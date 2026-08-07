-- 独山子大峡谷 AI 营销中台：新媒体智能数据导入中心 V1.0
-- 数据库：PostgreSQL 14+
-- 范围：新增导入日志与作品批次关联，不修改 OTA 数据对象。

BEGIN;

CREATE TABLE IF NOT EXISTS data_import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    import_type VARCHAR(16) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_data_import_logs_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_data_import_logs_import_type
        CHECK (import_type IN ('excel', 'image')),
    CONSTRAINT ck_data_import_logs_status
        CHECK (status IN ('pending', 'completed', 'failed', 'deleted')),
    CONSTRAINT ck_data_import_logs_success_count
        CHECK (success_count >= 0),
    CONSTRAINT ck_data_import_logs_error_count
        CHECK (error_count >= 0)
);

ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS import_log_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_social_posts_import_log'
    ) THEN
        ALTER TABLE social_posts
            ADD CONSTRAINT fk_social_posts_import_log
            FOREIGN KEY (import_log_id) REFERENCES data_import_logs (id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_data_import_logs_created_at
    ON data_import_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_import_logs_status
    ON data_import_logs (status);

CREATE INDEX IF NOT EXISTS idx_social_posts_import_log_id
    ON social_posts (import_log_id);

COMMENT ON TABLE data_import_logs IS '新媒体数据导入中心：Excel 与图片导入操作记录';
COMMENT ON COLUMN social_posts.import_log_id IS '作品所属导入批次，用于审计与安全回滚';

COMMIT;
