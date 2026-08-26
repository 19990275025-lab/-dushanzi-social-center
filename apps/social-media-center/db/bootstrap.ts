import { getD1 } from "./index";
import { ensureKuaishouAdapterSchema } from "./kuaishou-adapter-schema";

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
  `CREATE TABLE IF NOT EXISTS data_maintenance_runs (
    operation TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
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
    source_file TEXT,
    batch_key TEXT,
    unavailable_count INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_count >= 0),
    raw_payload TEXT,
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
  `CREATE TABLE IF NOT EXISTS fan_collection_batches (
    batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    collection_date TEXT NOT NULL,
    source_file TEXT NOT NULL,
    data_period TEXT,
    raw_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (raw_metric_count >= 0),
    success_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (success_metric_count >= 0),
    unavailable_metric_count INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_metric_count >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_collection_batch_source
    ON fan_collection_batches(platform, account_id, source_file)`,
  `CREATE INDEX IF NOT EXISTS idx_fan_collection_batch_date
    ON fan_collection_batches(platform, collection_date DESC)`,
  `CREATE TABLE IF NOT EXISTS social_fans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    account_name TEXT,
    snapshot_date TEXT,
    fans_count INTEGER NOT NULL DEFAULT 0 CHECK (fans_count >= 0),
    display_fans_count TEXT,
    male_ratio REAL,
    female_ratio REAL,
    collection_time TEXT,
    data_period TEXT,
    gender_distribution TEXT NOT NULL DEFAULT '[]',
    age_distribution TEXT NOT NULL DEFAULT '[]',
    region_distribution TEXT NOT NULL DEFAULT '[]',
    interest_distribution TEXT NOT NULL DEFAULT '[]',
    active_time_distribution TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual')),
    source_record_id TEXT,
    raw_payload TEXT,
    batch_id INTEGER REFERENCES fan_collection_batches(batch_id) ON DELETE SET NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_fans_account_collected_at
    ON social_fans(account_id, collected_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_fans_platform_collected_at
    ON social_fans(platform, collected_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_fans_source_record
    ON social_fans(platform, source_record_id)`,
  `CREATE TABLE IF NOT EXISTS fan_profile_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES fan_collection_batches(batch_id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,
    dimension_type TEXT NOT NULL CHECK (dimension_type IN ('gender','age','region','interest','device','activity','follow_keyword','other')),
    dimension_name TEXT NOT NULL,
    dimension_value REAL,
    percentage REAL,
    ranking INTEGER,
    raw_value TEXT,
    collection_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_profile_batch_dimension
    ON fan_profile_records(batch_id, dimension_type, dimension_name)`,
  `CREATE INDEX IF NOT EXISTS idx_fan_profile_account_snapshot
    ON fan_profile_records(account_id, snapshot_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_fan_profile_type_snapshot
    ON fan_profile_records(platform, dimension_type, snapshot_date DESC)`,
  `CREATE TABLE IF NOT EXISTS fan_growth_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    record_date TEXT NOT NULL,
    batch_id INTEGER REFERENCES fan_collection_batches(batch_id) ON DELETE SET NULL,
    snapshot_date TEXT,
    period_type TEXT NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily','7d','30d','natural_month','custom')),
    period_start TEXT,
    period_end TEXT,
    fans_count INTEGER NOT NULL DEFAULT 0 CHECK (fans_count >= 0),
    net_growth INTEGER NOT NULL DEFAULT 0,
    new_fans INTEGER NOT NULL DEFAULT 0 CHECK (new_fans >= 0),
    lost_fans INTEGER NOT NULL DEFAULT 0 CHECK (lost_fans >= 0),
    new_followers INTEGER,
    lost_followers INTEGER,
    returning_followers INTEGER,
    collection_time TEXT,
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fan_growth_platform_date
    ON fan_growth_records(platform, record_date DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_growth_source_record
    ON fan_growth_records(platform, source_record_id)`,
  `CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    source TEXT NOT NULL DEFAULT 'system',
    platform_post_id TEXT,
    title TEXT NOT NULL,
    content_type TEXT NOT NULL,
    publish_time TEXT NOT NULL,
    video_url TEXT,
    post_url TEXT,
    cover_url TEXT,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
    fans_growth INTEGER NOT NULL DEFAULT 0,
    hashtags TEXT NOT NULL DEFAULT '[]',
    duration INTEGER,
    duration_seconds REAL,
    post_type TEXT,
    post_status TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    content_metadata TEXT,
    data_availability_status TEXT NOT NULL DEFAULT 'unavailable'
      CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
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
  `CREATE INDEX IF NOT EXISTS idx_social_posts_account_publish_time
    ON social_posts(account_id, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_platform_publish_time
    ON social_posts(platform, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_collection_log_id
    ON social_posts(collection_log_id)`,
  `CREATE TABLE IF NOT EXISTS social_post_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    snapshot_time TEXT NOT NULL,
    collection_time TEXT NOT NULL,
    snapshot_date TEXT,
    collection_batch TEXT,
    play_count INTEGER CHECK (play_count IS NULL OR play_count >= 0),
    like_count INTEGER CHECK (like_count IS NULL OR like_count >= 0),
    comment_overview_count INTEGER CHECK (comment_overview_count IS NULL OR comment_overview_count >= 0),
    actual_loaded_count INTEGER CHECK (actual_loaded_count IS NULL OR actual_loaded_count >= 0),
    comment_rows_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_rows_count >= 0),
    favorite_count INTEGER CHECK (favorite_count IS NULL OR favorite_count >= 0),
    share_count INTEGER CHECK (share_count IS NULL OR share_count >= 0),
    danmaku_count INTEGER CHECK (danmaku_count IS NULL OR danmaku_count >= 0),
    follower_gain INTEGER CHECK (follower_gain IS NULL OR follower_gain >= 0),
    follower_loss INTEGER CHECK (follower_loss IS NULL OR follower_loss >= 0),
    follower_play_ratio REAL,
    page_entry_rate REAL,
    data_availability_status TEXT NOT NULL CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
    traffic_availability_status TEXT NOT NULL CHECK (traffic_availability_status IN ('available','partial','expired','unavailable')),
    traffic_sources_availability_status TEXT NOT NULL CHECK (traffic_sources_availability_status IN ('available','partial','expired','unavailable')),
    audience_availability_status TEXT NOT NULL CHECK (audience_availability_status IN ('available','partial','expired','unavailable')),
    comment_keywords_availability_status TEXT NOT NULL CHECK (comment_keywords_availability_status IN ('available','partial','expired','unavailable')),
    comments_availability_status TEXT NOT NULL CHECK (comments_availability_status IN ('available','partial','expired','unavailable')),
    post_age_days INTEGER NOT NULL CHECK (post_age_days >= 0),
    source_file TEXT NOT NULL,
    raw_payload TEXT NOT NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    source_record_status TEXT NOT NULL DEFAULT 'normal',
    source_failure_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_snapshots_post_time
    ON social_post_snapshots(post_id, snapshot_time)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_snapshots_platform_time
    ON social_post_snapshots(platform, snapshot_time DESC)`,
  `CREATE TABLE IF NOT EXISTS social_post_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    evaluation_date TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    total_score REAL,
    grade TEXT,
    propagation_score REAL,
    interaction_score REAL,
    attraction_score REAL,
    efficiency_score REAL,
    confidence TEXT NOT NULL,
    douyin_paid_status TEXT NOT NULL DEFAULT 'none',
    data_completeness REAL,
    raw_evaluation TEXT NOT NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_evaluations_snapshot
    ON social_post_evaluations(post_id, evaluation_date, snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_evaluations_post_date
    ON social_post_evaluations(post_id, evaluation_date DESC)`,
  `CREATE TABLE IF NOT EXISTS content_collection_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    full_path TEXT NOT NULL,
    checksum TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size >= 0),
    collection_date TEXT,
    collection_time TEXT,
    collection_batch TEXT,
    actual_post_count INTEGER NOT NULL DEFAULT 0 CHECK (actual_post_count >= 0),
    completeness_score REAL,
    detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validated_at TEXT,
    processed_at TEXT,
    status TEXT NOT NULL DEFAULT 'detected'
      CHECK (status IN ('detected','validated','processing','completed','failed')),
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    metadata TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_content_collection_files_checksum
    ON content_collection_files(checksum)`,
  `CREATE INDEX IF NOT EXISTS idx_content_collection_files_status_time
    ON content_collection_files(status, collection_time DESC)`,
  `CREATE TABLE IF NOT EXISTS social_post_metric_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    series_name TEXT NOT NULL,
    point_index INTEGER NOT NULL CHECK (point_index >= 0),
    point_time TEXT,
    point_label TEXT,
    metric_value REAL,
    unit TEXT,
    source_path TEXT NOT NULL,
    raw_value TEXT,
    data_availability_status TEXT NOT NULL DEFAULT 'available',
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_metric_series_point
    ON social_post_metric_series(snapshot_id, metric_type, series_name, point_index)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_metric_series_post_type_time
    ON social_post_metric_series(post_id, metric_type, point_time)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_metric_series_time
    ON social_post_metric_series(post_id, metric_type, series_name, point_time)
    WHERE point_time IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS social_post_paid_traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT NOT NULL,
    campaign_type TEXT NOT NULL,
    play_count INTEGER CHECK (play_count IS NULL OR play_count >= 0),
    relationship_to_overview TEXT NOT NULL DEFAULT 'unknown'
      CHECK (relationship_to_overview IN ('unknown','included','additional')),
    detail_available INTEGER CHECK (detail_available IS NULL OR detail_available IN (0, 1)),
    data_availability_status TEXT NOT NULL,
    raw_payload TEXT NOT NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_paid_traffic_snapshot_type
    ON social_post_paid_traffic(snapshot_id, campaign_type)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_paid_traffic_post_time
    ON social_post_paid_traffic(post_id, snapshot_time DESC)`,
  `CREATE TABLE IF NOT EXISTS social_post_audience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT NOT NULL,
    dimension_type TEXT NOT NULL,
    dimension_name TEXT NOT NULL,
    dimension_value REAL,
    percentage REAL,
    ranking INTEGER,
    raw_value TEXT,
    data_availability_status TEXT NOT NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_audience_snapshot_dimension
    ON social_post_audience(snapshot_id, dimension_type, dimension_name)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_audience_post_type
    ON social_post_audience(post_id, dimension_type)`,
  `CREATE TABLE IF NOT EXISTS social_post_traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT NOT NULL,
    completion_rate REAL,
    average_play_duration_seconds REAL,
    two_sec_bounce_rate REAL,
    five_sec_completion_rate REAL,
    average_play_ratio REAL,
    cover_click_rate REAL,
    swipe_away_rate REAL,
    page_entry_rate REAL,
    comment_entry_rate REAL,
    text_expand_rate REAL,
    text_completion_rate REAL,
    average_images_viewed REAL,
    like_rate REAL,
    comment_rate REAL,
    share_rate REAL,
    favorite_rate REAL,
    not_interested_rate REAL,
    data_availability_status TEXT NOT NULL CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
    raw_payload TEXT NOT NULL,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_traffic_snapshot
    ON social_post_traffic(snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_traffic_post_time
    ON social_post_traffic(post_id, snapshot_time DESC)`,
  `CREATE TABLE IF NOT EXISTS social_post_traffic_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_name TEXT NOT NULL,
    traffic_value REAL,
    percentage REAL,
    change_percentage REAL,
    traffic_nature TEXT NOT NULL CHECK (traffic_nature IN ('organic','paid','other')),
    raw_value TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_traffic_source_nature
    ON social_post_traffic_sources(post_id, traffic_nature, snapshot_time DESC)`,
  `CREATE TABLE IF NOT EXISTS content_audience_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    gender_distribution TEXT NOT NULL DEFAULT '[]',
    age_distribution TEXT NOT NULL DEFAULT '[]',
    region_distribution TEXT NOT NULL DEFAULT '[]',
    snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT,
    dimension_type TEXT,
    dimension_name TEXT,
    dimension_value REAL,
    percentage REAL,
    ranking INTEGER,
    raw_value TEXT,
    data_availability_status TEXT NOT NULL DEFAULT 'available'
      CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
    source_type TEXT NOT NULL DEFAULT 'api' CHECK (source_type IN ('chrome','excel','api','manual','douyin_app')),
    source_record_id TEXT,
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_audience_post
    ON content_audience_analysis(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_audience_platform_collected_at
    ON content_audience_analysis(platform, collected_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_content_audience_source_record
    ON content_audience_analysis(platform, source_record_id)`,
  `CREATE TABLE IF NOT EXISTS social_post_comment_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_time TEXT NOT NULL,
    keyword TEXT NOT NULL,
    ranking INTEGER,
    occurrence_count INTEGER,
    sentiment TEXT,
    category TEXT,
    data_availability_status TEXT NOT NULL DEFAULT 'available'
      CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
    raw_value TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_comment_keyword_snapshot
    ON social_post_comment_keywords(snapshot_id, keyword, ranking)`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_comment_keyword_post_time
    ON social_post_comment_keywords(post_id, snapshot_time DESC)`,
  `CREATE TABLE IF NOT EXISTS social_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
    source TEXT NOT NULL DEFAULT 'system',
    source_comment_id TEXT,
    comment_fingerprint TEXT,
    snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL,
    snapshot_time TEXT,
    username TEXT NOT NULL,
    comment_text TEXT,
    comment_type TEXT NOT NULL DEFAULT 'text' CHECK (comment_type IN ('text','image','emoji','mixed','other')),
    comment_time TEXT,
    comment_time_raw TEXT,
    likes INTEGER NOT NULL DEFAULT 0,
    likes_availability_status TEXT NOT NULL DEFAULT 'available',
    likes_raw_value TEXT,
    reply_count INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
    is_author INTEGER NOT NULL DEFAULT 0 CHECK (is_author IN (0, 1)),
    author_replied INTEGER CHECK (author_replied IS NULL OR author_replied IN (0, 1)),
    sentiment TEXT NOT NULL DEFAULT 'unknown',
    keyword TEXT,
    user_need TEXT,
    ai_analysis TEXT,
    ai_reply TEXT,
    raw_payload TEXT,
    data_availability_status TEXT NOT NULL DEFAULT 'available'
      CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_post_comment_time
    ON social_comments(post_id, comment_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_sentiment
    ON social_comments(sentiment)`,
  `CREATE INDEX IF NOT EXISTS idx_social_comments_user_need
    ON social_comments(user_need)`,
  `CREATE TABLE IF NOT EXISTS social_comment_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL REFERENCES social_comments(id) ON UPDATE CASCADE ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
    snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL,
    source_reply_id TEXT,
    reply_fingerprint TEXT NOT NULL,
    username TEXT NOT NULL,
    reply_text TEXT,
    reply_type TEXT NOT NULL DEFAULT 'text',
    reply_time TEXT,
    reply_time_raw TEXT,
    likes INTEGER,
    is_author INTEGER CHECK (is_author IS NULL OR is_author IN (0, 1)),
    data_availability_status TEXT NOT NULL DEFAULT 'available',
    raw_payload TEXT,
    collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_social_comment_replies_fingerprint
    ON social_comment_replies(comment_id, reply_fingerprint)`,
  `CREATE INDEX IF NOT EXISTS idx_social_comment_replies_post
    ON social_comment_replies(post_id, reply_time DESC)`,
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
    ON competitor_posts(platform, source_record_id)`,
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
    collaborators TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_id INTEGER,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'planning',
    related_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL,
    review_result TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_tasks_date_status
    ON content_tasks(task_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_content_tasks_responsible_person
    ON content_tasks(responsible_person)`,
  `CREATE TABLE IF NOT EXISTS content_plans (
    plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    hot_topic_id INTEGER NOT NULL REFERENCES hot_topics(id) ON DELETE RESTRICT,
    task_id INTEGER REFERENCES content_tasks(id) ON DELETE SET NULL,
    related_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL,
    platform TEXT NOT NULL DEFAULT 'douyin' CHECK (platform = 'douyin'),
    content_type TEXT NOT NULL CHECK (content_type IN ('guide','scenery','visitor_experience','challenge','live')),
    title TEXT NOT NULL,
    title_options TEXT NOT NULL DEFAULT '[]',
    script TEXT NOT NULL,
    shot_list TEXT NOT NULL DEFAULT '[]',
    cover_text TEXT NOT NULL,
    hashtags TEXT NOT NULL DEFAULT '[]',
    recommended_topics TEXT NOT NULL DEFAULT '[]',
    background_music TEXT,
    publish_time TEXT NOT NULL,
    live_theme TEXT,
    target_views INTEGER NOT NULL DEFAULT 0 CHECK (target_views >= 0),
    target_interaction_rate REAL NOT NULL DEFAULT 0 CHECK (target_interaction_rate >= 0),
    target_fans_growth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','task_created','published','reviewed')),
    created_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_content_plans_topic_platform
    ON content_plans(hot_topic_id, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_content_plans_status_publish_time
    ON content_plans(status, publish_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_content_plans_task_id
    ON content_plans(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_plans_related_post_id
    ON content_plans(related_post_id)`,
  `CREATE TABLE IF NOT EXISTS content_plan_feedback (
    plan_id INTEGER PRIMARY KEY REFERENCES content_plans(plan_id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE RESTRICT,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
    favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
    shares INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
    effect_score REAL NOT NULL DEFAULT 0 CHECK (effect_score >= 0 AND effect_score <= 100),
    ai_summary TEXT NOT NULL,
    evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_content_plan_feedback_post_id
    ON content_plan_feedback(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_plan_feedback_effect_score
    ON content_plan_feedback(effect_score DESC)`,
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
  const postColumnNames = new Set(postColumns.results.map((column) => column.name));
  const missingPostV2Columns = [
    ["platform_post_id", "ALTER TABLE social_posts ADD COLUMN platform_post_id TEXT"],
    ["post_url", "ALTER TABLE social_posts ADD COLUMN post_url TEXT"],
    ["duration_seconds", "ALTER TABLE social_posts ADD COLUMN duration_seconds REAL"],
    ["post_type", "ALTER TABLE social_posts ADD COLUMN post_type TEXT"],
    ["post_status", "ALTER TABLE social_posts ADD COLUMN post_status TEXT"],
    ["is_pinned", "ALTER TABLE social_posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"],
    ["content_metadata", "ALTER TABLE social_posts ADD COLUMN content_metadata TEXT"],
    ["data_availability_status", "ALTER TABLE social_posts ADD COLUMN data_availability_status TEXT NOT NULL DEFAULT 'unavailable'"],
  ] as const;
  for (const [name, statement] of missingPostV2Columns) {
    if (!postColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1.batch([
    d1.prepare("UPDATE social_posts SET post_url = COALESCE(post_url, video_url), duration_seconds = COALESCE(duration_seconds, duration)"),
  ]);
  await d1
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_social_posts_import_log_id ON social_posts(import_log_id)",
    )
    .run();

  const snapshotColumns = await d1.prepare("PRAGMA table_info(social_post_snapshots)").all<{ name: string }>();
  const snapshotColumnNames = new Set(snapshotColumns.results.map((column) => column.name));
  if (!snapshotColumnNames.has("source_record_status")) {
    await d1.prepare("ALTER TABLE social_post_snapshots ADD COLUMN source_record_status TEXT NOT NULL DEFAULT 'normal'").run();
  }
  if (!snapshotColumnNames.has("source_failure_reason")) {
    await d1.prepare("ALTER TABLE social_post_snapshots ADD COLUMN source_failure_reason TEXT").run();
  }
  if (!snapshotColumnNames.has("snapshot_date")) {
    await d1.prepare("ALTER TABLE social_post_snapshots ADD COLUMN snapshot_date TEXT").run();
  }
  if (!snapshotColumnNames.has("collection_batch")) {
    await d1.prepare("ALTER TABLE social_post_snapshots ADD COLUMN collection_batch TEXT").run();
  }
  await d1.batch([
    d1.prepare("UPDATE social_post_snapshots SET snapshot_date = substr(snapshot_time, 1, 10) WHERE snapshot_date IS NULL"),
    d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_snapshots_post_date_batch
      ON social_post_snapshots(post_id, snapshot_date, collection_batch) WHERE collection_batch IS NOT NULL`),
  ]);

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
  const missingCollectionV2Columns = [
    ["source_file", "ALTER TABLE collection_logs ADD COLUMN source_file TEXT"],
    ["batch_key", "ALTER TABLE collection_logs ADD COLUMN batch_key TEXT"],
    ["unavailable_count", "ALTER TABLE collection_logs ADD COLUMN unavailable_count INTEGER NOT NULL DEFAULT 0"],
    ["raw_payload", "ALTER TABLE collection_logs ADD COLUMN raw_payload TEXT"],
  ] as const;
  for (const [name, statement] of missingCollectionV2Columns) {
    if (!collectionColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_logs_batch_key ON collection_logs(batch_key) WHERE batch_key IS NOT NULL").run();

  const socialFanColumns = await d1.prepare("PRAGMA table_info(social_fans)").all<{ name: string }>();
  const socialFanColumnNames = new Set(socialFanColumns.results.map((column) => column.name));
  const missingSocialFanColumns = [
    ["account_name", "ALTER TABLE social_fans ADD COLUMN account_name TEXT"],
    ["snapshot_date", "ALTER TABLE social_fans ADD COLUMN snapshot_date TEXT"],
    ["display_fans_count", "ALTER TABLE social_fans ADD COLUMN display_fans_count TEXT"],
    ["male_ratio", "ALTER TABLE social_fans ADD COLUMN male_ratio REAL"],
    ["female_ratio", "ALTER TABLE social_fans ADD COLUMN female_ratio REAL"],
    ["collection_time", "ALTER TABLE social_fans ADD COLUMN collection_time TEXT"],
    ["data_period", "ALTER TABLE social_fans ADD COLUMN data_period TEXT"],
    ["batch_id", "ALTER TABLE social_fans ADD COLUMN batch_id INTEGER REFERENCES fan_collection_batches(batch_id) ON DELETE SET NULL"],
  ] as const;
  for (const [name, statement] of missingSocialFanColumns) {
    if (!socialFanColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1.batch([
    d1.prepare(`UPDATE social_fans SET
      account_name = COALESCE(account_name, (SELECT account_name FROM social_accounts WHERE social_accounts.id = social_fans.account_id)),
      snapshot_date = COALESCE(snapshot_date, date(collected_at)),
      collection_time = COALESCE(collection_time, collected_at),
      data_period = COALESCE(data_period, '["legacy"]'),
      male_ratio = COALESCE(male_ratio, (
        SELECT CAST(json_extract(value, '$.value') AS REAL) FROM json_each(social_fans.gender_distribution)
        WHERE json_extract(value, '$.label') = '男性' LIMIT 1
      )),
      female_ratio = COALESCE(female_ratio, (
        SELECT CAST(json_extract(value, '$.value') AS REAL) FROM json_each(social_fans.gender_distribution)
        WHERE json_extract(value, '$.label') = '女性' LIMIT 1
      ))`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_social_fans_batch ON social_fans(batch_id) WHERE batch_id IS NOT NULL"),
  ]);

  const fanGrowthColumns = await d1.prepare("PRAGMA table_info(fan_growth_records)").all<{ name: string }>();
  const fanGrowthColumnNames = new Set(fanGrowthColumns.results.map((column) => column.name));
  const missingFanGrowthColumns = [
    ["batch_id", "ALTER TABLE fan_growth_records ADD COLUMN batch_id INTEGER REFERENCES fan_collection_batches(batch_id) ON DELETE SET NULL"],
    ["snapshot_date", "ALTER TABLE fan_growth_records ADD COLUMN snapshot_date TEXT"],
    ["period_type", "ALTER TABLE fan_growth_records ADD COLUMN period_type TEXT NOT NULL DEFAULT 'daily'"],
    ["period_start", "ALTER TABLE fan_growth_records ADD COLUMN period_start TEXT"],
    ["period_end", "ALTER TABLE fan_growth_records ADD COLUMN period_end TEXT"],
    ["new_followers", "ALTER TABLE fan_growth_records ADD COLUMN new_followers INTEGER"],
    ["lost_followers", "ALTER TABLE fan_growth_records ADD COLUMN lost_followers INTEGER"],
    ["returning_followers", "ALTER TABLE fan_growth_records ADD COLUMN returning_followers INTEGER"],
    ["collection_time", "ALTER TABLE fan_growth_records ADD COLUMN collection_time TEXT"],
  ] as const;
  for (const [name, statement] of missingFanGrowthColumns) {
    if (!fanGrowthColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1.batch([
    d1.prepare(`UPDATE fan_growth_records SET
      snapshot_date = COALESCE(snapshot_date, record_date),
      period_type = CASE WHEN json_extract(raw_payload, '$.granularity') = 'period_summary' THEN 'custom' ELSE COALESCE(period_type, 'daily') END,
      period_end = COALESCE(period_end, record_date),
      new_followers = COALESCE(new_followers, new_fans),
      lost_followers = COALESCE(lost_followers, lost_fans),
      returning_followers = COALESCE(returning_followers, json_extract(raw_payload, '$.returningFans')),
      collection_time = COALESCE(collection_time, updated_at, created_at)`),
    d1.prepare("DROP INDEX IF EXISTS uq_fan_growth_account_date"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_fan_growth_batch_period ON fan_growth_records(batch_id, period_type) WHERE batch_id IS NOT NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_fan_growth_platform_period ON fan_growth_records(platform, period_type, period_end DESC)"),
  ]);

  const audienceColumns = await d1.prepare("PRAGMA table_info(content_audience_analysis)").all<{ name: string }>();
  const audienceColumnNames = new Set(audienceColumns.results.map((column) => column.name));
  const missingAudienceV2Columns = [
    ["snapshot_id", "ALTER TABLE content_audience_analysis ADD COLUMN snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE CASCADE"],
    ["snapshot_time", "ALTER TABLE content_audience_analysis ADD COLUMN snapshot_time TEXT"],
    ["dimension_type", "ALTER TABLE content_audience_analysis ADD COLUMN dimension_type TEXT"],
    ["dimension_name", "ALTER TABLE content_audience_analysis ADD COLUMN dimension_name TEXT"],
    ["dimension_value", "ALTER TABLE content_audience_analysis ADD COLUMN dimension_value REAL"],
    ["percentage", "ALTER TABLE content_audience_analysis ADD COLUMN percentage REAL"],
    ["ranking", "ALTER TABLE content_audience_analysis ADD COLUMN ranking INTEGER"],
    ["raw_value", "ALTER TABLE content_audience_analysis ADD COLUMN raw_value TEXT"],
    ["data_availability_status", "ALTER TABLE content_audience_analysis ADD COLUMN data_availability_status TEXT NOT NULL DEFAULT 'available'"],
  ] as const;
  for (const [name, statement] of missingAudienceV2Columns) {
    if (!audienceColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1.batch([
    d1.prepare("DROP INDEX IF EXISTS uq_content_audience_post"),
    d1.prepare("DROP INDEX IF EXISTS uq_content_audience_dimension_snapshot"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_content_audience_post ON content_audience_analysis(post_id)"),
    d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_content_audience_dimension_snapshot
      ON content_audience_analysis(snapshot_id, dimension_type, dimension_name)`),
  ]);

  let commentColumns = await d1
    .prepare("PRAGMA table_info(social_comments)")
    .all<{ name: string; notnull: number }>();
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
  commentColumns = await d1.prepare("PRAGMA table_info(social_comments)").all<{ name: string; notnull: number }>();
  const requiresNullableCommentMigration = commentColumns.results.some((column) =>
    (column.name === "comment_text" || column.name === "comment_time") && column.notnull === 1,
  );
  if (requiresNullableCommentMigration) {
    await d1.batch([
      d1.prepare("DROP INDEX IF EXISTS idx_social_comments_post_comment_time"),
      d1.prepare("DROP INDEX IF EXISTS idx_social_comments_sentiment"),
      d1.prepare("DROP INDEX IF EXISTS idx_social_comments_user_need"),
      d1.prepare("DROP INDEX IF EXISTS idx_social_comments_collection_log_id"),
      d1.prepare("ALTER TABLE social_comments RENAME TO social_comments_legacy_v2"),
      d1.prepare(`CREATE TABLE social_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES social_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK (platform IN ('douyin','kuaishou','weibo')),
        source TEXT NOT NULL DEFAULT 'system',
        source_comment_id TEXT,
        comment_fingerprint TEXT,
        snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL,
        snapshot_time TEXT,
        username TEXT NOT NULL,
        comment_text TEXT,
        comment_type TEXT NOT NULL DEFAULT 'text' CHECK (comment_type IN ('text','image','emoji','mixed','other')),
        comment_time TEXT,
        comment_time_raw TEXT,
        likes INTEGER NOT NULL DEFAULT 0,
        likes_availability_status TEXT NOT NULL DEFAULT 'available',
        likes_raw_value TEXT,
        reply_count INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
        is_author INTEGER NOT NULL DEFAULT 0 CHECK (is_author IN (0, 1)),
        author_replied INTEGER CHECK (author_replied IS NULL OR author_replied IN (0, 1)),
        sentiment TEXT NOT NULL DEFAULT 'unknown',
        keyword TEXT,
        user_need TEXT,
        ai_analysis TEXT,
        ai_reply TEXT,
        raw_payload TEXT,
        data_availability_status TEXT NOT NULL DEFAULT 'available'
          CHECK (data_availability_status IN ('available','partial','expired','unavailable')),
        collection_log_id INTEGER REFERENCES collection_logs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      d1.prepare(`INSERT INTO social_comments
        (id, post_id, platform, source, username, comment_text, comment_type, comment_time,
         comment_time_raw, likes, sentiment, keyword, user_need, ai_analysis, ai_reply,
         collection_log_id, created_at)
        SELECT id, post_id, platform, source, username, comment_text, 'text', comment_time,
          comment_time, likes, sentiment, keyword, user_need, ai_analysis, ai_reply,
          collection_log_id, created_at
        FROM social_comments_legacy_v2`),
      d1.prepare("DROP TABLE social_comments_legacy_v2"),
    ]);
  }
  const refreshedCommentColumns = await d1.prepare("PRAGMA table_info(social_comments)").all<{ name: string }>();
  const commentColumnNames = new Set(refreshedCommentColumns.results.map((column) => column.name));
  const missingCommentV2Columns = [
    ["source_comment_id", "ALTER TABLE social_comments ADD COLUMN source_comment_id TEXT"],
    ["comment_fingerprint", "ALTER TABLE social_comments ADD COLUMN comment_fingerprint TEXT"],
    ["snapshot_id", "ALTER TABLE social_comments ADD COLUMN snapshot_id INTEGER REFERENCES social_post_snapshots(id) ON UPDATE CASCADE ON DELETE SET NULL"],
    ["snapshot_time", "ALTER TABLE social_comments ADD COLUMN snapshot_time TEXT"],
    ["comment_type", "ALTER TABLE social_comments ADD COLUMN comment_type TEXT NOT NULL DEFAULT 'text'"],
    ["comment_time_raw", "ALTER TABLE social_comments ADD COLUMN comment_time_raw TEXT"],
    ["likes_availability_status", "ALTER TABLE social_comments ADD COLUMN likes_availability_status TEXT NOT NULL DEFAULT 'available'"],
    ["likes_raw_value", "ALTER TABLE social_comments ADD COLUMN likes_raw_value TEXT"],
    ["reply_count", "ALTER TABLE social_comments ADD COLUMN reply_count INTEGER NOT NULL DEFAULT 0"],
    ["is_author", "ALTER TABLE social_comments ADD COLUMN is_author INTEGER NOT NULL DEFAULT 0"],
    ["author_replied", "ALTER TABLE social_comments ADD COLUMN author_replied INTEGER"],
    ["raw_payload", "ALTER TABLE social_comments ADD COLUMN raw_payload TEXT"],
    ["data_availability_status", "ALTER TABLE social_comments ADD COLUMN data_availability_status TEXT NOT NULL DEFAULT 'available'"],
  ] as const;
  for (const [name, statement] of missingCommentV2Columns) {
    if (!commentColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_social_comments_collection_log_id ON social_comments(collection_log_id)")
    .run();
  await d1
    .prepare("CREATE INDEX IF NOT EXISTS idx_social_comments_user_need ON social_comments(user_need)")
    .run();
  await d1
    .prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_social_comments_fingerprint ON social_comments(post_id, comment_fingerprint) WHERE comment_fingerprint IS NOT NULL")
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
    d1.prepare("DROP INDEX IF EXISTS uq_hot_topics_daily_snapshot"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_hot_topics_relay_identity ON hot_topics(collection_date, platform, topic_type, topic_name, ranking)"),
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

  const taskColumns = await d1.prepare("PRAGMA table_info(content_tasks)").all<{ name: string }>();
  const taskColumnNames = new Set(taskColumns.results.map((column) => column.name));
  const missingTaskColumns = [
    ["collaborators", "ALTER TABLE content_tasks ADD COLUMN collaborators TEXT NOT NULL DEFAULT '[]'"],
    ["source_type", "ALTER TABLE content_tasks ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'"],
    ["source_id", "ALTER TABLE content_tasks ADD COLUMN source_id INTEGER"],
    ["priority", "ALTER TABLE content_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'"],
    ["related_post_id", "ALTER TABLE content_tasks ADD COLUMN related_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL"],
    ["completed_at", "ALTER TABLE content_tasks ADD COLUMN completed_at TEXT"],
    ["updated_at", "ALTER TABLE content_tasks ADD COLUMN updated_at TEXT"],
  ] as const;
  for (const [name, statement] of missingTaskColumns) {
    if (!taskColumnNames.has(name)) await d1.prepare(statement).run();
  }
  await d1.batch([
    d1.prepare(`UPDATE content_tasks SET status = CASE status
      WHEN 'idea' THEN 'planning' WHEN 'approved' THEN 'shoot_pending'
      WHEN 'in_production' THEN 'shooting' WHEN 'review' THEN 'review_pending'
      WHEN 'scheduled' THEN 'publish_pending' WHEN 'done' THEN 'reviewed'
      WHEN 'blocked' THEN 'planning' WHEN 'cancelled' THEN 'planning' ELSE status END`),
    d1.prepare("UPDATE content_tasks SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)"),
    d1.prepare(`UPDATE content_tasks SET source_type = 'ai_content_plan',
      source_id = (SELECT plan_id FROM content_plans WHERE content_plans.task_id = content_tasks.id LIMIT 1)
      WHERE EXISTS (SELECT 1 FROM content_plans WHERE content_plans.task_id = content_tasks.id)`),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_content_tasks_source ON content_tasks(source_type, source_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_content_tasks_related_post ON content_tasks(related_post_id)"),
  ]);

  await ensureKuaishouAdapterSchema(d1);
  await d1.prepare("PRAGMA optimize").run();
}

export async function ensureDatabase() {
  initialization ??= initialize().catch((error) => {
    initialization = null;
    throw error;
  });

  return initialization;
}
