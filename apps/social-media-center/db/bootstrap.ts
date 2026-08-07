import { getD1, shouldLoadTestData } from "./index";

let initialization: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS social_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo','wechat_channels')),
    account_name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_url TEXT,
    followers_count INTEGER NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
    following_count INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),
    likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_accounts_platform_account_id
    ON social_accounts(platform, account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_platform_status
    ON social_accounts(platform, status)`,
  `CREATE TABLE IF NOT EXISTS data_import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo','wechat_channels')),
    file_name TEXT NOT NULL,
    import_type TEXT NOT NULL CHECK (import_type IN ('excel','image')),
    status TEXT NOT NULL DEFAULT 'pending',
    success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_data_import_logs_created_at
    ON data_import_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_data_import_logs_status
    ON data_import_logs(status)`,
  `CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo','wechat_channels')),
    title TEXT NOT NULL,
    content_type TEXT NOT NULL,
    publish_time TEXT NOT NULL,
    video_url TEXT,
    cover_url TEXT,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
    fans_growth INTEGER NOT NULL DEFAULT 0,
    hashtags TEXT NOT NULL DEFAULT '[]',
    duration INTEGER,
    ai_analysis TEXT,
    import_log_id INTEGER REFERENCES data_import_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_posts_account_title
    ON social_posts(account_id, title)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_account_publish_time
    ON social_posts(account_id, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_platform_publish_time
    ON social_posts(platform, publish_time DESC)`,
  `CREATE TABLE IF NOT EXISTS social_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL,
    username TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    comment_time TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    sentiment TEXT NOT NULL DEFAULT 'unknown',
    keyword TEXT,
    user_need TEXT,
    ai_reply TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_post_comment_time
    ON social_comments(post_id, comment_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_sentiment
    ON social_comments(sentiment)`,
  `CREATE TABLE IF NOT EXISTS hot_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    heat_value REAL NOT NULL DEFAULT 0,
    trend TEXT NOT NULL DEFAULT 'new',
    category TEXT,
    related_degree REAL,
    ai_suggestion TEXT,
    collect_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topics_platform_name
    ON hot_topics(platform, topic_name)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topics_platform_collect_time
    ON hot_topics(platform, collect_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topics_related_degree
    ON hot_topics(related_degree DESC)`,
  `CREATE TABLE IF NOT EXISTS competitor_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_url TEXT NOT NULL,
    followers INTEGER NOT NULL DEFAULT 0,
    industry TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_competitor_accounts_platform_url
    ON competitor_accounts(platform, account_url)`,
  `CREATE TABLE IF NOT EXISTS content_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_date TEXT NOT NULL,
    platform TEXT NOT NULL,
    task_title TEXT NOT NULL,
    content_type TEXT NOT NULL,
    responsible_person TEXT,
    status TEXT NOT NULL DEFAULT 'idea',
    review_result TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_tasks_date_status
    ON content_tasks(task_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_content_tasks_responsible_person
    ON content_tasks(responsible_person)`,
];

const seedStatements = [
  `INSERT OR IGNORE INTO social_accounts
    (platform, account_name, account_id, account_url, followers_count, following_count, likes_count, status)
    VALUES ('douyin', '独山子大峡谷景区抖音', 'test_dsz_douyin', 'https://example.invalid/douyin/test_dsz_douyin', 128600, 128, 986000, 'active')`,
  `INSERT OR IGNORE INTO social_accounts
    (platform, account_name, account_id, account_url, followers_count, following_count, likes_count, status)
    VALUES ('weibo', '独山子大峡谷景区微博', 'test_dsz_weibo', 'https://example.invalid/weibo/test_dsz_weibo', 56300, 246, 317000, 'active')`,
  `INSERT OR IGNORE INTO social_posts
    (account_id, platform, title, content_type, publish_time, video_url, cover_url, views, likes, comments, favorites, shares, fans_growth, hashtags, duration, ai_analysis)
    SELECT id, 'douyin', '峡谷日落', 'video', datetime('now', '-2 hours'),
      'https://example.invalid/videos/canyon-sunset.mp4', 'https://example.invalid/covers/canyon-sunset.jpg',
      368000, 28600, 1320, 9680, 4510, 3260, '["独山子大峡谷","新疆旅行","峡谷日落"]', 38,
      '{"summary":"日落画面带来较高收藏与分享，适合发展为固定栏目。","confidence":0.86,"sample":true}'
    FROM social_accounts WHERE platform = 'douyin' AND account_id = 'test_dsz_douyin'`,
  `INSERT OR IGNORE INTO social_posts
    (account_id, platform, title, content_type, publish_time, video_url, cover_url, views, likes, comments, favorites, shares, fans_growth, hashtags, duration, ai_analysis)
    SELECT id, 'douyin', '玻璃桥挑战', 'video', datetime('now', '-1 day'),
      'https://example.invalid/videos/glass-bridge-challenge.mp4', 'https://example.invalid/covers/glass-bridge-challenge.jpg',
      512000, 41700, 2860, 7230, 6890, 4870, '["独山子大峡谷","玻璃桥","旅行挑战"]', 52,
      '{"summary":"挑战类内容评论活跃，应同时强化安全规则说明。","confidence":0.90,"sample":true}'
    FROM social_accounts WHERE platform = 'douyin' AND account_id = 'test_dsz_douyin'`,
  `INSERT OR IGNORE INTO social_posts
    (account_id, platform, title, content_type, publish_time, video_url, cover_url, views, likes, comments, favorites, shares, fans_growth, hashtags, duration, ai_analysis)
    SELECT id, 'weibo', '游客第一视角', 'video', datetime('now', '-3 days'),
      'https://example.invalid/videos/visitor-first-person.mp4', 'https://example.invalid/covers/visitor-first-person.jpg',
      146000, 9200, 680, 2410, 1750, 980, '["独山子大峡谷","游客视角","新疆自驾"]', 45,
      '{"summary":"第一视角增强临场感，可测试路线说明和到访行动指引。","confidence":0.82,"sample":true}'
    FROM social_accounts WHERE platform = 'weibo' AND account_id = 'test_dsz_weibo'`,
  `INSERT OR IGNORE INTO hot_topics
    (platform, topic_name, heat_value, trend, category, related_degree, ai_suggestion)
    VALUES ('douyin', '新疆自驾避暑路线', 9860000, 'rising', '旅游', 0.96, '结合独库公路行程，制作峡谷半日游路线。')`,
  `INSERT OR IGNORE INTO hot_topics
    (platform, topic_name, heat_value, trend, category, related_degree, ai_suggestion)
    VALUES ('weibo', '新疆的夏天有多治愈', 7240000, 'rising', '地域', 0.91, '用游客第一视角展示峡谷光影和风声。')`,
  `INSERT OR IGNORE INTO hot_topics
    (platform, topic_name, heat_value, trend, category, related_degree, ai_suggestion)
    VALUES ('wechat_channels', '周末短途旅行', 4680000, 'stable', '旅游', 0.78, '强调交通时长、适合人群和安全提示。')`,
  `INSERT OR IGNORE INTO content_tasks
    (task_date, platform, task_title, content_type, responsible_person, status, review_result)
    VALUES (date('now'), 'douyin', '峡谷晨雾延时拍摄', 'video', '阿依努尔', 'in_production', NULL)`,
  `INSERT OR IGNORE INTO content_tasks
    (task_date, platform, task_title, content_type, responsible_person, status, review_result)
    VALUES (date('now'), 'weibo', '游客问答图文整理', 'image_text', '李明', 'review', '等待交通信息复核')`,
  `INSERT OR IGNORE INTO content_tasks
    (task_date, platform, task_title, content_type, responsible_person, status, review_result)
    VALUES (date('now'), 'wechat_channels', '工作人员带路', 'video', '王雪', 'scheduled', 'L2 安全审核通过')`,
  `INSERT OR IGNORE INTO content_tasks
    (task_date, platform, task_title, content_type, responsible_person, status, review_result)
    VALUES (date('now'), 'douyin', '日落观景点发布', 'video', '张晨', 'published', '审核通过')`,
];

async function initialize() {
  const d1 = getD1();
  await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));

  const postColumns = await d1
    .prepare("PRAGMA table_info(social_posts)")
    .all<{ name: string }>();
  if (!postColumns.results.some((column) => column.name === "import_log_id")) {
    await d1
      .prepare(
        "ALTER TABLE social_posts ADD COLUMN import_log_id INTEGER REFERENCES data_import_logs(id) ON DELETE SET NULL",
      )
      .run();
  }
  await d1
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_social_posts_import_log_id ON social_posts(import_log_id)",
    )
    .run();

  if (shouldLoadTestData()) {
    await d1.batch(seedStatements.map((statement) => d1.prepare(statement)));
  }
}

export async function ensureDatabase() {
  initialization ??= initialize().catch((error) => {
    initialization = null;
    throw error;
  });

  return initialization;
}
