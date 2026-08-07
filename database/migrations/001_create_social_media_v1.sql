-- 独山子大峡谷 AI 营销中台：新媒体运营数据库 V1.0
-- 数据库：PostgreSQL 14+
-- 范围：仅创建新媒体运营中心独立对象，不修改任何 OTA 表或对象。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_id VARCHAR(128) NOT NULL,
    account_url TEXT,
    followers_count BIGINT NOT NULL DEFAULT 0,
    following_count BIGINT NOT NULL DEFAULT 0,
    likes_count BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_social_accounts_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_social_accounts_followers_count
        CHECK (followers_count >= 0),
    CONSTRAINT ck_social_accounts_following_count
        CHECK (following_count >= 0),
    CONSTRAINT ck_social_accounts_likes_count
        CHECK (likes_count >= 0),
    CONSTRAINT ck_social_accounts_status
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT uq_social_accounts_platform_account_id
        UNIQUE (platform, account_id)
);

CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    platform VARCHAR(32) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content_type VARCHAR(32) NOT NULL,
    publish_time TIMESTAMPTZ NOT NULL,
    video_url TEXT,
    cover_url TEXT,
    views BIGINT NOT NULL DEFAULT 0,
    likes BIGINT NOT NULL DEFAULT 0,
    comments BIGINT NOT NULL DEFAULT 0,
    favorites BIGINT NOT NULL DEFAULT 0,
    shares BIGINT NOT NULL DEFAULT 0,
    fans_growth BIGINT NOT NULL DEFAULT 0,
    hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration INTEGER,
    ai_analysis JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_social_posts_account
        FOREIGN KEY (account_id) REFERENCES social_accounts (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT ck_social_posts_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_social_posts_content_type
        CHECK (content_type IN ('video', 'image_text', 'text', 'live', 'article')),
    CONSTRAINT ck_social_posts_views CHECK (views >= 0),
    CONSTRAINT ck_social_posts_likes CHECK (likes >= 0),
    CONSTRAINT ck_social_posts_comments CHECK (comments >= 0),
    CONSTRAINT ck_social_posts_favorites CHECK (favorites >= 0),
    CONSTRAINT ck_social_posts_shares CHECK (shares >= 0),
    CONSTRAINT ck_social_posts_duration CHECK (duration IS NULL OR duration >= 0),
    CONSTRAINT ck_social_posts_hashtags_json
        CHECK (jsonb_typeof(hashtags) = 'array'),
    CONSTRAINT ck_social_posts_ai_analysis_json
        CHECK (ai_analysis IS NULL OR jsonb_typeof(ai_analysis) = 'object'),
    CONSTRAINT uq_social_posts_seed_identity
        UNIQUE (account_id, title, publish_time)
);

CREATE TABLE IF NOT EXISTS social_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    platform VARCHAR(32) NOT NULL,
    username VARCHAR(255) NOT NULL,
    comment_text TEXT NOT NULL,
    comment_time TIMESTAMPTZ NOT NULL,
    likes BIGINT NOT NULL DEFAULT 0,
    sentiment VARCHAR(16) NOT NULL DEFAULT 'unknown',
    keyword VARCHAR(255),
    user_need TEXT,
    ai_reply TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_social_comments_post
        FOREIGN KEY (post_id) REFERENCES social_posts (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT ck_social_comments_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_social_comments_likes CHECK (likes >= 0),
    CONSTRAINT ck_social_comments_sentiment
        CHECK (sentiment IN ('positive', 'neutral', 'negative', 'unknown'))
);

CREATE TABLE IF NOT EXISTS hot_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    topic_name VARCHAR(500) NOT NULL,
    heat_value NUMERIC(20, 2) NOT NULL DEFAULT 0,
    trend VARCHAR(16) NOT NULL DEFAULT 'new',
    category VARCHAR(128),
    related_degree NUMERIC(5, 4),
    ai_suggestion TEXT,
    collect_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_hot_topics_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_hot_topics_heat_value CHECK (heat_value >= 0),
    CONSTRAINT ck_hot_topics_trend
        CHECK (trend IN ('rising', 'stable', 'falling', 'new')),
    CONSTRAINT ck_hot_topics_related_degree
        CHECK (related_degree IS NULL OR (related_degree >= 0 AND related_degree <= 1)),
    CONSTRAINT uq_hot_topics_observation
        UNIQUE (platform, topic_name, collect_time)
);

CREATE TABLE IF NOT EXISTS competitor_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(32) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_url TEXT NOT NULL,
    followers BIGINT NOT NULL DEFAULT 0,
    industry VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_competitor_accounts_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_competitor_accounts_followers CHECK (followers >= 0),
    CONSTRAINT uq_competitor_accounts_platform_url
        UNIQUE (platform, account_url)
);

CREATE TABLE IF NOT EXISTS content_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_date DATE NOT NULL,
    platform VARCHAR(32) NOT NULL,
    task_title VARCHAR(500) NOT NULL,
    content_type VARCHAR(32) NOT NULL,
    responsible_person VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'idea',
    review_result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_content_tasks_platform
        CHECK (platform IN ('douyin', 'kuaishou', 'weibo', 'wechat_channels')),
    CONSTRAINT ck_content_tasks_content_type
        CHECK (content_type IN ('video', 'image_text', 'text', 'live', 'article')),
    CONSTRAINT ck_content_tasks_status
        CHECK (status IN (
            'idea', 'approved', 'in_production', 'review', 'scheduled',
            'published', 'blocked', 'done', 'cancelled'
        ))
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_platform_status
    ON social_accounts (platform, status);

CREATE INDEX IF NOT EXISTS idx_social_posts_account_publish_time
    ON social_posts (account_id, publish_time DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_platform_publish_time
    ON social_posts (platform, publish_time DESC);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_comment_time
    ON social_comments (post_id, comment_time DESC);

CREATE INDEX IF NOT EXISTS idx_social_comments_sentiment
    ON social_comments (sentiment);

CREATE INDEX IF NOT EXISTS idx_hot_topics_platform_collect_time
    ON hot_topics (platform, collect_time DESC);

CREATE INDEX IF NOT EXISTS idx_hot_topics_related_degree
    ON hot_topics (related_degree DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_accounts_platform_industry
    ON competitor_accounts (platform, industry);

CREATE INDEX IF NOT EXISTS idx_content_tasks_date_status
    ON content_tasks (task_date, status);

CREATE INDEX IF NOT EXISTS idx_content_tasks_responsible_person
    ON content_tasks (responsible_person);

CREATE OR REPLACE FUNCTION set_social_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_accounts_updated_at ON social_accounts;
CREATE TRIGGER trg_social_accounts_updated_at
    BEFORE UPDATE ON social_accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_social_updated_at();

DROP TRIGGER IF EXISTS trg_social_posts_updated_at ON social_posts;
CREATE TRIGGER trg_social_posts_updated_at
    BEFORE UPDATE ON social_posts
    FOR EACH ROW
    EXECUTE FUNCTION set_social_updated_at();

COMMENT ON TABLE social_accounts IS '新媒体运营中心：景区及矩阵账号信息';
COMMENT ON TABLE social_posts IS '新媒体运营中心：已发布作品及表现数据';
COMMENT ON TABLE social_comments IS '新媒体运营中心：作品评论及 AI 分析结果';
COMMENT ON TABLE hot_topics IS '新媒体运营中心：平台热点观察数据';
COMMENT ON TABLE competitor_accounts IS '新媒体运营中心：竞品账号台账';
COMMENT ON TABLE content_tasks IS '新媒体运营中心：内容生产与审核任务';

COMMIT;
