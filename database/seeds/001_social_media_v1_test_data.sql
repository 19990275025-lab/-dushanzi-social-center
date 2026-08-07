-- 新媒体运营数据库 V1.0 模拟数据
-- 可重复执行：账号及作品均通过唯一约束执行幂等写入。

BEGIN;

INSERT INTO social_accounts (
    platform,
    account_name,
    account_id,
    account_url,
    followers_count,
    following_count,
    likes_count,
    status
)
VALUES
    (
        'douyin',
        '独山子大峡谷景区抖音',
        'test_dsz_douyin',
        'https://example.invalid/douyin/test_dsz_douyin',
        128600,
        128,
        986000,
        'active'
    ),
    (
        'weibo',
        '独山子大峡谷景区微博',
        'test_dsz_weibo',
        'https://example.invalid/weibo/test_dsz_weibo',
        56300,
        246,
        317000,
        'active'
    )
ON CONFLICT (platform, account_id) DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_url = EXCLUDED.account_url,
    followers_count = EXCLUDED.followers_count,
    following_count = EXCLUDED.following_count,
    likes_count = EXCLUDED.likes_count,
    status = EXCLUDED.status;

INSERT INTO social_posts (
    account_id,
    platform,
    title,
    content_type,
    publish_time,
    video_url,
    cover_url,
    views,
    likes,
    comments,
    favorites,
    shares,
    fans_growth,
    hashtags,
    duration,
    ai_analysis
)
SELECT
    id,
    'douyin',
    '峡谷日落',
    'video',
    TIMESTAMPTZ '2026-07-18 20:15:00+08',
    'https://example.invalid/videos/canyon-sunset.mp4',
    'https://example.invalid/covers/canyon-sunset.jpg',
    368000,
    28600,
    1320,
    9680,
    4510,
    3260,
    '["独山子大峡谷", "新疆旅行", "峡谷日落"]'::jsonb,
    38,
    '{"summary":"日落画面带来较高收藏与分享，适合发展为固定栏目。","confidence":0.86,"sample":true}'::jsonb
FROM social_accounts
WHERE platform = 'douyin' AND account_id = 'test_dsz_douyin'
ON CONFLICT (account_id, title, publish_time) DO UPDATE SET
    views = EXCLUDED.views,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    favorites = EXCLUDED.favorites,
    shares = EXCLUDED.shares,
    fans_growth = EXCLUDED.fans_growth,
    ai_analysis = EXCLUDED.ai_analysis;

INSERT INTO social_posts (
    account_id,
    platform,
    title,
    content_type,
    publish_time,
    video_url,
    cover_url,
    views,
    likes,
    comments,
    favorites,
    shares,
    fans_growth,
    hashtags,
    duration,
    ai_analysis
)
SELECT
    id,
    'douyin',
    '玻璃桥挑战',
    'video',
    TIMESTAMPTZ '2026-07-23 12:30:00+08',
    'https://example.invalid/videos/glass-bridge-challenge.mp4',
    'https://example.invalid/covers/glass-bridge-challenge.jpg',
    512000,
    41700,
    2860,
    7230,
    6890,
    4870,
    '["独山子大峡谷", "玻璃桥", "旅行挑战"]'::jsonb,
    52,
    '{"summary":"挑战类内容评论活跃，应同时强化安全规则说明。","confidence":0.90,"sample":true}'::jsonb
FROM social_accounts
WHERE platform = 'douyin' AND account_id = 'test_dsz_douyin'
ON CONFLICT (account_id, title, publish_time) DO UPDATE SET
    views = EXCLUDED.views,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    favorites = EXCLUDED.favorites,
    shares = EXCLUDED.shares,
    fans_growth = EXCLUDED.fans_growth,
    ai_analysis = EXCLUDED.ai_analysis;

INSERT INTO social_posts (
    account_id,
    platform,
    title,
    content_type,
    publish_time,
    video_url,
    cover_url,
    views,
    likes,
    comments,
    favorites,
    shares,
    fans_growth,
    hashtags,
    duration,
    ai_analysis
)
SELECT
    id,
    'weibo',
    '游客第一视角',
    'video',
    TIMESTAMPTZ '2026-07-28 10:00:00+08',
    'https://example.invalid/videos/visitor-first-person.mp4',
    'https://example.invalid/covers/visitor-first-person.jpg',
    146000,
    9200,
    680,
    2410,
    1750,
    980,
    '["独山子大峡谷", "游客视角", "新疆自驾"]'::jsonb,
    45,
    '{"summary":"第一视角增强临场感，可测试路线说明和到访行动指引。","confidence":0.82,"sample":true}'::jsonb
FROM social_accounts
WHERE platform = 'weibo' AND account_id = 'test_dsz_weibo'
ON CONFLICT (account_id, title, publish_time) DO UPDATE SET
    views = EXCLUDED.views,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    favorites = EXCLUDED.favorites,
    shares = EXCLUDED.shares,
    fans_growth = EXCLUDED.fans_growth,
    ai_analysis = EXCLUDED.ai_analysis;

COMMIT;
