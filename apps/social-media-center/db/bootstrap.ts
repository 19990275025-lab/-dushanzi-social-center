import { getD1 } from "./index";

let initialization: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS social_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
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
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
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
  `CREATE TABLE IF NOT EXISTS collection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    source_type TEXT NOT NULL CHECK (source_type IN ('chrome','excel','api')),
    source_name TEXT NOT NULL,
    source_url TEXT,
    entity_type TEXT NOT NULL DEFAULT 'post',
    status TEXT NOT NULL DEFAULT 'pending',
    total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
    comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    error_message TEXT,
    collected_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_collection_logs_created_at
    ON collection_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_collection_logs_platform_status
    ON collection_logs(platform, status)`,
  `CREATE TABLE IF NOT EXISTS collection_staging_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_log_id INTEGER NOT NULL REFERENCES collection_logs(id) ON DELETE CASCADE,
    record_index INTEGER NOT NULL CHECK (record_index >= 0),
    data_type TEXT NOT NULL CHECK (data_type IN ('hot_topic','content','comment')),
    platform TEXT,
    source TEXT NOT NULL,
    normalized_payload TEXT,
    raw_payload TEXT NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'valid' CHECK (validation_status IN ('valid','invalid')),
    validation_errors TEXT NOT NULL DEFAULT '[]',
    confirmed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_staging_log_index
    ON collection_staging_records(collection_log_id, record_index)`,
  `CREATE INDEX IF NOT EXISTS idx_collection_staging_log_status
    ON collection_staging_records(collection_log_id, validation_status)`,
  `CREATE TABLE IF NOT EXISTS social_fans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    fans_count INTEGER NOT NULL DEFAULT 0 CHECK (fans_count >= 0),
    gender_distribution TEXT NOT NULL DEFAULT '[]',
    age_distribution TEXT NOT NULL DEFAULT '[]',
    region_distribution TEXT NOT NULL DEFAULT '[]',
    interest_distribution TEXT NOT NULL DEFAULT '[]',
    active_time_distribution TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_fans_account_collected_at
    ON social_fans(account_id, collected_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_fans_platform_collected_at
    ON social_fans(platform, collected_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_fans_source_record
    ON social_fans(platform, source_record_id) WHERE source_record_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS fan_growth_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    record_date TEXT NOT NULL,
    fans_count INTEGER NOT NULL DEFAULT 0 CHECK (fans_count >= 0),
    net_growth INTEGER NOT NULL DEFAULT 0,
    new_fans INTEGER NOT NULL DEFAULT 0 CHECK (new_fans >= 0),
    lost_fans INTEGER NOT NULL DEFAULT 0 CHECK (lost_fans >= 0),
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_growth_account_date
    ON fan_growth_records(account_id, record_date)`,
  `CREATE INDEX IF NOT EXISTS idx_fan_growth_platform_date
    ON fan_growth_records(platform, record_date DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_growth_source_record
    ON fan_growth_records(platform, source_record_id) WHERE source_record_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    source TEXT NOT NULL DEFAULT 'system',
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
    completion_rate REAL,
    skip_rate REAL,
    average_play_duration REAL,
    traffic_sources TEXT NOT NULL DEFAULT '[]',
    ai_analysis TEXT,
    import_log_id INTEGER REFERENCES data_import_logs(id) ON DELETE SET NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_posts_account_title
    ON social_posts(account_id, title)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_account_publish_time
    ON social_posts(account_id, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_platform_publish_time
    ON social_posts(platform, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_collection_log_id
    ON social_posts(collection_log_id)`,
  `CREATE TABLE IF NOT EXISTS content_audience_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    gender_distribution TEXT NOT NULL DEFAULT '[]',
    age_distribution TEXT NOT NULL DEFAULT '[]',
    region_distribution TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual','douyin_app')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_content_audience_post
    ON content_audience_analysis(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_audience_platform_collected_at
    ON content_audience_analysis(platform, collected_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_content_audience_source_record
    ON content_audience_analysis(platform, source_record_id) WHERE source_record_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS social_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    source TEXT NOT NULL DEFAULT 'system',
    username TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    comment_time TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    sentiment TEXT NOT NULL DEFAULT 'unknown',
    keyword TEXT,
    user_need TEXT,
    ai_analysis TEXT,
    ai_reply TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_post_comment_time
    ON social_comments(post_id, comment_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_sentiment
    ON social_comments(sentiment)`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_user_need
    ON social_comments(user_need)`,
  `CREATE TABLE IF NOT EXISTS hot_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo','web')),
    topic_type TEXT NOT NULL DEFAULT 'hot_rank' CHECK (topic_type IN ('hot_rank','planting_rank','challenge_rank')),
    data_source TEXT,
    source TEXT NOT NULL DEFAULT 'system',
    topic_name TEXT NOT NULL,
    keyword TEXT NOT NULL,
    heat_value REAL NOT NULL DEFAULT 0,
    ranking INTEGER,
    trend TEXT NOT NULL DEFAULT 'new',
    category TEXT,
    related_degree REAL,
    ai_suggestion TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    source_url TEXT,
    source_record_id TEXT,
    source_agent TEXT,
    hot_score REAL,
    recommended_topic TEXT,
    video_direction TEXT,
    publish_time_suggestion TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    collect_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    collection_date TEXT NOT NULL DEFAULT (date(datetime(CURRENT_TIMESTAMP, '+8 hours'))),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topics_platform_collect_time
    ON hot_topics(platform, collect_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topics_related_degree
    ON hot_topics(related_degree DESC)`,
  `CREATE TABLE IF NOT EXISTS hot_topic_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hot_topic_id INTEGER NOT NULL REFERENCES hot_topics(id) ON DELETE CASCADE,
    relevance_score REAL NOT NULL CHECK (relevance_score >= 0 AND relevance_score <= 100),
    recommend_follow INTEGER NOT NULL DEFAULT 0 CHECK (recommend_follow IN (0, 1)),
    recommendation_reason TEXT NOT NULL,
    recommended_title TEXT NOT NULL,
    shooting_direction TEXT NOT NULL,
    live_theme TEXT NOT NULL,
    analysis_source TEXT NOT NULL DEFAULT 'WorkBuddy热点监测报告',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topic_analysis_topic_source
    ON hot_topic_analysis(hot_topic_id, analysis_source)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_analysis_topic_id
    ON hot_topic_analysis(hot_topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_analysis_recommend_score
    ON hot_topic_analysis(recommend_follow, relevance_score DESC)`,
  `CREATE TABLE IF NOT EXISTS hot_topic_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hot_topic_id INTEGER NOT NULL REFERENCES hot_topics(id) ON DELETE CASCADE,
    recommended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recommended_content TEXT NOT NULL,
    social_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL,
    related_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    publish_time TEXT,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
    effect_score REAL CHECK (effect_score >= 0 AND effect_score <= 100),
    ai_summary TEXT,
    is_effective INTEGER CHECK (is_effective IN (0, 1)),
    evaluated_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_topic_recommended
    ON hot_topic_feedback(hot_topic_id, recommended_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_social_post
    ON hot_topic_feedback(social_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_related_post
    ON hot_topic_feedback(related_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_platform_publish
    ON hot_topic_feedback(platform, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_effect_score
    ON hot_topic_feedback(effect_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_effective
    ON hot_topic_feedback(is_effective)`,
  `CREATE TABLE IF NOT EXISTS hot_topic_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    hot_topic_id INTEGER NOT NULL REFERENCES hot_topics(id) ON DELETE RESTRICT,
    topic_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    topic_type TEXT NOT NULL DEFAULT 'hot_rank',
    heat_value REAL NOT NULL DEFAULT 0,
    ai_score REAL,
    recommendation_level TEXT NOT NULL DEFAULT 'C' CHECK (recommendation_level IN ('A','B','C')),
    recommended_title TEXT,
    content_direction TEXT,
    related_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL,
    effect_score REAL,
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topic_archive_date_topic
    ON hot_topic_archive(archive_date, hot_topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_archive_date_platform
    ON hot_topic_archive(archive_date, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_archive_type_date
    ON hot_topic_archive(topic_type, archive_date)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_archive_level_score
    ON hot_topic_archive(recommendation_level, effect_score DESC)`,
  `CREATE TABLE IF NOT EXISTS HOT_TOPIC_DATA (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo','web')),
    rank INTEGER NOT NULL CHECK (rank > 0),
    topic_title TEXT NOT NULL,
    heat_value TEXT NOT NULL,
    keyword TEXT NOT NULL,
    url TEXT,
    publish_time TEXT,
    category TEXT,
    source_agent TEXT NOT NULL,
    ai_relevance_score REAL,
    ai_analysis TEXT,
    ai_recommendation TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topic_data_source_topic
    ON HOT_TOPIC_DATA(source_agent, platform, topic_title, publish_time)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_data_platform_rank
    ON HOT_TOPIC_DATA(platform, rank)`,
  `CREATE INDEX IF NOT EXISTS idx_hot_topic_data_relevance
    ON HOT_TOPIC_DATA(ai_relevance_score DESC)`,
  `CREATE TABLE IF NOT EXISTS competitor_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    account_name TEXT NOT NULL,
    account_url TEXT NOT NULL,
    followers INTEGER NOT NULL DEFAULT 0,
    industry TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_competitor_accounts_platform_url
    ON competitor_accounts(platform, account_url)`,
  `CREATE TABLE IF NOT EXISTS competitor_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    account_name TEXT NOT NULL,
    title TEXT NOT NULL,
    publish_time TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_competitor_posts_platform_publish_time
    ON competitor_posts(platform, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_competitor_posts_account_publish_time
    ON competitor_posts(account_name, publish_time DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_competitor_posts_source_record
    ON competitor_posts(platform, source_record_id) WHERE source_record_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS viral_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    category TEXT NOT NULL CHECK (category IN ('tourism','scenic','xinjiang','nature')),
    account_name TEXT,
    title TEXT NOT NULL,
    publish_time TEXT NOT NULL,
    video_url TEXT,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
    video_structure TEXT,
    title_pattern TEXT,
    first_three_seconds TEXT,
    shooting_method TEXT,
    interaction_method TEXT,
    comment_feedback TEXT,
    breakout_reason TEXT,
    replicable_elements TEXT,
    dushanzi_suggestion TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('chrome','excel','api','manual')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_viral_videos_category_publish_time
    ON viral_videos(category, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_viral_videos_platform_views
    ON viral_videos(platform, views DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_viral_videos_source_record
    ON viral_videos(platform, source_record_id) WHERE source_record_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS content_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_date TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
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

async function initialize() {
  const d1 = getD1();
  const legacyHotTopicDataset = await d1.prepare("SELECT type FROM sqlite_schema WHERE name = 'HOT_TOPIC_DATA'")
    .first<{ type: string }>();
  if (legacyHotTopicDataset?.type === "view") {
    await d1.prepare("DROP VIEW HOT_TOPIC_DATA").run();
  }
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
  if (!postColumns.results.some((column) => column.name === "collection_log_id")) {
    await d1
      .prepare(
        "ALTER TABLE social_posts ADD COLUMN collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL",
      )
      .run();
  }
  if (!postColumns.results.some((column) => column.name === "completion_rate")) {
    await d1.prepare("ALTER TABLE social_posts ADD COLUMN completion_rate REAL").run();
  }
  if (!postColumns.results.some((column) => column.name === "skip_rate")) {
    await d1.prepare("ALTER TABLE social_posts ADD COLUMN skip_rate REAL").run();
  }
  if (!postColumns.results.some((column) => column.name === "average_play_duration")) {
    await d1.prepare("ALTER TABLE social_posts ADD COLUMN average_play_duration REAL").run();
  }
  if (!postColumns.results.some((column) => column.name === "traffic_sources")) {
    await d1.prepare("ALTER TABLE social_posts ADD COLUMN traffic_sources TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!postColumns.results.some((column) => column.name === "source")) {
    await d1.prepare("ALTER TABLE social_posts ADD COLUMN source TEXT NOT NULL DEFAULT 'system'").run();
  }
  await d1
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_social_posts_import_log_id ON social_posts(import_log_id)",
    )
    .run();

  const collectionColumns = await d1
    .prepare("PRAGMA table_info(collection_logs)")
    .all<{ name: string }>();
  const collectionColumnNames = new Set(collectionColumns.results.map((column) => column.name));
  if (!collectionColumnNames.has("entity_type")) {
    await d1.prepare("ALTER TABLE collection_logs ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'post'").run();
  }
  if (!collectionColumnNames.has("comment_count")) {
    await d1.prepare("ALTER TABLE collection_logs ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0").run();
  }

  const commentColumns = await d1
    .prepare("PRAGMA table_info(social_comments)")
    .all<{ name: string }>();
  if (!commentColumns.results.some((column) => column.name === "collection_log_id")) {
    await d1
      .prepare("ALTER TABLE social_comments ADD COLUMN collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL")
      .run();
  }
  if (!commentColumns.results.some((column) => column.name === "ai_analysis")) {
    await d1.prepare("ALTER TABLE social_comments ADD COLUMN ai_analysis TEXT").run();
  }
  if (!commentColumns.results.some((column) => column.name === "source")) {
    await d1.prepare("ALTER TABLE social_comments ADD COLUMN source TEXT NOT NULL DEFAULT 'system'").run();
  }
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_social_comments_collection_log_id ON social_comments(collection_log_id)")
    .run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_social_comments_user_need ON social_comments(user_need)")
    .run();
  await d1
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_social_posts_collection_log_id ON social_posts(collection_log_id)",
    )
    .run();

  const topicColumns = await d1
    .prepare("PRAGMA table_info(hot_topics)")
    .all<{ name: string }>();
  const topicColumnNames = new Set(topicColumns.results.map((column) => column.name));
  if (!topicColumnNames.has("keyword")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN keyword TEXT").run();
  }
  if (!topicColumnNames.has("status")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run();
  }
  if (!topicColumnNames.has("created_at")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN created_at TEXT").run();
  }
  if (!topicColumnNames.has("ranking")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN ranking INTEGER").run();
  }
  if (!topicColumnNames.has("source_url")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN source_url TEXT").run();
  }
  if (!topicColumnNames.has("source_record_id")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN source_record_id TEXT").run();
  }
  if (!topicColumnNames.has("collection_log_id")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL").run();
  }
  if (!topicColumnNames.has("source_agent")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN source_agent TEXT").run();
  }
  if (!topicColumnNames.has("hot_score")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN hot_score REAL").run();
  }
  if (!topicColumnNames.has("recommended_topic")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN recommended_topic TEXT").run();
  }
  if (!topicColumnNames.has("video_direction")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN video_direction TEXT").run();
  }
  if (!topicColumnNames.has("publish_time_suggestion")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN publish_time_suggestion TEXT").run();
  }
  if (!topicColumnNames.has("raw_payload")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN raw_payload TEXT").run();
  }
  if (!topicColumnNames.has("topic_type")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN topic_type TEXT NOT NULL DEFAULT 'hot_rank'").run();
  }
  if (!topicColumnNames.has("source")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN source TEXT NOT NULL DEFAULT 'system'").run();
  }
  if (!topicColumnNames.has("data_source")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN data_source TEXT").run();
  }
  if (!topicColumnNames.has("collection_date")) {
    await d1.prepare("ALTER TABLE hot_topics ADD COLUMN collection_date TEXT").run();
  }
  await d1.batch([
    d1.prepare("UPDATE hot_topics SET keyword = topic_name WHERE keyword IS NULL OR trim(keyword) = ''"),
    d1.prepare("UPDATE hot_topics SET created_at = COALESCE(collect_time, CURRENT_TIMESTAMP) WHERE created_at IS NULL"),
    d1.prepare("UPDATE hot_topics SET source = COALESCE(NULLIF(source_agent, ''), NULLIF(source_url, ''), source) WHERE source = 'system'"),
    d1.prepare("UPDATE hot_topics SET data_source = 'douyin_content_hot' WHERE platform = 'douyin' AND data_source IS NULL"),
    d1.prepare("UPDATE hot_topics SET collection_date = date(datetime(COALESCE(collect_time, created_at), '+8 hours')) WHERE collection_date IS NULL OR trim(collection_date) = ''"),
    d1.prepare("DROP INDEX IF EXISTS uq_hot_topics_platform_name"),
    d1.prepare("DROP INDEX IF EXISTS uq_hot_topics_platform_source_name"),
    d1.prepare("DROP INDEX IF EXISTS uq_hot_topics_non_douyin_name"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topics_daily_snapshot ON hot_topics(platform, data_source, topic_name, collection_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_collection_date_platform ON hot_topics(collection_date, platform)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_status_heat ON hot_topics(status, heat_value DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_keyword ON hot_topics(keyword)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_platform_ranking ON hot_topics(platform, ranking)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_platform_type_ranking ON hot_topics(platform, topic_type, ranking)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_platform_data_source_ranking ON hot_topics(platform, data_source, ranking)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topics_source_record ON hot_topics(platform, source_record_id) WHERE source_record_id IS NOT NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topics_source_agent_collect_time ON hot_topics(source_agent, collect_time DESC)"),
  ]);

  const feedbackColumns = await d1
    .prepare("PRAGMA table_info(hot_topic_feedback)")
    .all<{ name: string }>();
  const feedbackColumnNames = new Set(feedbackColumns.results.map((column) => column.name));
  if (!feedbackColumnNames.has("related_post_id")) {
    await d1.prepare("ALTER TABLE hot_topic_feedback ADD COLUMN related_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL").run();
  }
  if (!feedbackColumnNames.has("platform")) {
    await d1.prepare("ALTER TABLE hot_topic_feedback ADD COLUMN platform TEXT").run();
  }
  if (!feedbackColumnNames.has("publish_time")) {
    await d1.prepare("ALTER TABLE hot_topic_feedback ADD COLUMN publish_time TEXT").run();
  }
  if (!feedbackColumnNames.has("effect_score")) {
    await d1.prepare("ALTER TABLE hot_topic_feedback ADD COLUMN effect_score REAL").run();
  }
  if (!feedbackColumnNames.has("ai_summary")) {
    await d1.prepare("ALTER TABLE hot_topic_feedback ADD COLUMN ai_summary TEXT").run();
  }
  await d1.batch([
    d1.prepare("UPDATE hot_topic_feedback SET related_post_id = social_post_id WHERE related_post_id IS NULL AND social_post_id IS NOT NULL"),
    d1.prepare("UPDATE hot_topic_feedback SET platform = (SELECT platform FROM hot_topics WHERE hot_topics.id = hot_topic_feedback.hot_topic_id) WHERE platform IS NULL OR trim(platform) = ''"),
    d1.prepare("UPDATE hot_topic_feedback SET publish_time = (SELECT publish_time FROM social_posts WHERE social_posts.id = hot_topic_feedback.related_post_id) WHERE publish_time IS NULL AND related_post_id IS NOT NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_related_post ON hot_topic_feedback(related_post_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_platform_publish ON hot_topic_feedback(platform, publish_time DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hot_topic_feedback_effect_score ON hot_topic_feedback(effect_score DESC)"),
  ]);

  await d1.prepare("PRAGMA optimize").run();
}

export async function ensureDatabase() {
  initialization ??= initialize().catch((error) => {
    initialization = null;
    throw error;
  });

  return initialization;
}
