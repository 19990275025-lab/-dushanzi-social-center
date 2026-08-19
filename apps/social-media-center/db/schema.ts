import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const socialAccounts = sqliteTable(
  "social_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    accountName: text("account_name").notNull(),
    accountId: text("account_id").notNull(),
    accountUrl: text("account_url"),
    followersCount: integer("followers_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_social_accounts_platform_account_id").on(
      table.platform,
      table.accountId,
    ),
    index("idx_social_accounts_platform_status").on(table.platform, table.status),
  ],
);

export const dataImportLogs = sqliteTable(
  "data_import_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    fileName: text("file_name").notNull(),
    importType: text("import_type").notNull(),
    status: text("status").notNull().default("pending"),
    successCount: integer("success_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_data_import_logs_created_at").on(table.createdAt),
    index("idx_data_import_logs_status").on(table.status),
  ],
);

export const collectionLogs = sqliteTable(
  "collection_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    sourceType: text("source_type").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    entityType: text("entity_type").notNull().default("post"),
    status: text("status").notNull().default("pending"),
    totalCount: integer("total_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    errorMessage: text("error_message"),
    collectedAt: text("collected_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_collection_logs_created_at").on(table.createdAt),
    index("idx_collection_logs_platform_status").on(table.platform, table.status),
  ],
);

export const collectionStagingRecords = sqliteTable(
  "collection_staging_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collectionLogId: integer("collection_log_id")
      .notNull()
      .references(() => collectionLogs.id, { onDelete: "cascade" }),
    recordIndex: integer("record_index").notNull(),
    dataType: text("data_type").notNull(),
    platform: text("platform"),
    source: text("source").notNull(),
    normalizedPayload: text("normalized_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    validationStatus: text("validation_status").notNull().default("valid"),
    validationErrors: text("validation_errors", { mode: "json" }).$type<string[]>().notNull().default([]),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_collection_staging_log_index").on(table.collectionLogId, table.recordIndex),
    index("idx_collection_staging_log_status").on(table.collectionLogId, table.validationStatus),
  ],
);

export const socialFans = sqliteTable(
  "social_fans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade", onUpdate: "cascade" }),
    platform: text("platform").notNull(),
    fansCount: integer("fans_count").notNull().default(0),
    genderDistribution: text("gender_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    ageDistribution: text("age_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    regionDistribution: text("region_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    interestDistribution: text("interest_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    activeTimeDistribution: text("active_time_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    sourceType: text("source_type").notNull().default("api"),
    sourceRecordId: text("source_record_id"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, {
      onDelete: "set null",
    }),
    collectedAt: text("collected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_social_fans_account_collected_at").on(table.accountId, table.collectedAt),
    index("idx_social_fans_platform_collected_at").on(table.platform, table.collectedAt),
    uniqueIndex("uq_social_fans_source_record").on(table.platform, table.sourceRecordId),
  ],
);

export const fanGrowthRecords = sqliteTable(
  "fan_growth_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade", onUpdate: "cascade" }),
    platform: text("platform").notNull(),
    recordDate: text("record_date").notNull(),
    fansCount: integer("fans_count").notNull().default(0),
    netGrowth: integer("net_growth").notNull().default(0),
    newFans: integer("new_fans").notNull().default(0),
    lostFans: integer("lost_fans").notNull().default(0),
    sourceType: text("source_type").notNull().default("api"),
    sourceRecordId: text("source_record_id"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_fan_growth_account_date").on(table.accountId, table.recordDate),
    index("idx_fan_growth_platform_date").on(table.platform, table.recordDate),
    uniqueIndex("uq_fan_growth_source_record").on(table.platform, table.sourceRecordId),
  ],
);

export const socialPosts = sqliteTable(
  "social_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "restrict", onUpdate: "cascade" }),
    platform: text("platform").notNull(),
    source: text("source").notNull().default("system"),
    title: text("title").notNull(),
    contentType: text("content_type").notNull(),
    publishTime: text("publish_time").notNull(),
    videoUrl: text("video_url"),
    coverUrl: text("cover_url"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    fansGrowth: integer("fans_growth").notNull().default(0),
    hashtags: text("hashtags", { mode: "json" }).$type<string[]>().notNull().default([]),
    duration: integer("duration"),
    completionRate: real("completion_rate"),
    skipRate: real("skip_rate"),
    averagePlayDuration: real("average_play_duration"),
    trafficSources: text("traffic_sources", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    aiAnalysis: text("ai_analysis", { mode: "json" }).$type<{
      summary?: string;
      confidence?: number;
      sample?: boolean;
    } | null>(),
    importLogId: integer("import_log_id").references(() => dataImportLogs.id, {
      onDelete: "set null",
    }),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_social_posts_account_title").on(table.accountId, table.title),
    index("idx_social_posts_account_publish_time").on(table.accountId, table.publishTime),
    index("idx_social_posts_platform_publish_time").on(table.platform, table.publishTime),
    index("idx_social_posts_import_log_id").on(table.importLogId),
    index("idx_social_posts_collection_log_id").on(table.collectionLogId),
  ],
);

export const contentAudienceAnalysis = sqliteTable(
  "content_audience_analysis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade", onUpdate: "cascade" }),
    platform: text("platform").notNull(),
    genderDistribution: text("gender_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    ageDistribution: text("age_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    regionDistribution: text("region_distribution", { mode: "json" })
      .$type<Array<{ label: string; value: number }>>()
      .notNull()
      .default([]),
    sourceType: text("source_type").notNull().default("api"),
    sourceRecordId: text("source_record_id"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, {
      onDelete: "set null",
    }),
    collectedAt: text("collected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_content_audience_post").on(table.postId),
    index("idx_content_audience_platform_collected_at").on(table.platform, table.collectedAt),
    uniqueIndex("uq_content_audience_source_record").on(table.platform, table.sourceRecordId),
  ],
);

export const socialComments = sqliteTable(
  "social_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade", onUpdate: "cascade" }),
    platform: text("platform").notNull(),
    source: text("source").notNull().default("system"),
    username: text("username").notNull(),
    commentText: text("comment_text").notNull(),
    commentTime: text("comment_time").notNull(),
    likes: integer("likes").notNull().default(0),
    sentiment: text("sentiment").notNull().default("unknown"),
    keyword: text("keyword"),
    userNeed: text("user_need"),
    aiAnalysis: text("ai_analysis", { mode: "json" }).$type<{
      engine: string;
      confidence: number;
      sentimentScore: number;
      matchedRules: string[];
      analyzedAt: string;
    } | null>(),
    aiReply: text("ai_reply"),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_social_comments_post_comment_time").on(table.postId, table.commentTime),
    index("idx_social_comments_sentiment").on(table.sentiment),
    index("idx_social_comments_user_need").on(table.userNeed),
    index("idx_social_comments_collection_log_id").on(table.collectionLogId),
  ],
);

export const hotTopics = sqliteTable(
  "hot_topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    topicType: text("topic_type").notNull().default("hot_rank"),
    dataSource: text("data_source"),
    source: text("source").notNull().default("system"),
    topicName: text("topic_name").notNull(),
    keyword: text("keyword").notNull(),
    heatValue: real("heat_value").notNull().default(0),
    ranking: integer("ranking"),
    trend: text("trend").notNull().default("new"),
    category: text("category"),
    relatedDegree: real("related_degree"),
    aiSuggestion: text("ai_suggestion"),
    status: text("status").notNull().default("active"),
    sourceUrl: text("source_url"),
    sourceRecordId: text("source_record_id"),
    sourceAgent: text("source_agent"),
    hotScore: real("hot_score"),
    recommendedTopic: text("recommended_topic"),
    videoDirection: text("video_direction"),
    publishTimeSuggestion: text("publish_time_suggestion"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, {
      onDelete: "set null",
    }),
    collectTime: text("collect_time").notNull().default(sql`CURRENT_TIMESTAMP`),
    collectionDate: text("collection_date").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_hot_topics_relay_identity").on(
      table.collectionDate,
      table.platform,
      table.topicType,
      table.topicName,
      table.ranking,
    ),
    index("idx_hot_topics_platform_collect_time").on(table.platform, table.collectTime),
    index("idx_hot_topics_collection_date_platform").on(table.collectionDate, table.platform),
    index("idx_hot_topics_related_degree").on(table.relatedDegree),
    index("idx_hot_topics_status_heat").on(table.status, table.heatValue),
    index("idx_hot_topics_keyword").on(table.keyword),
    index("idx_hot_topics_platform_ranking").on(table.platform, table.ranking),
    index("idx_hot_topics_platform_type_ranking").on(table.platform, table.topicType, table.ranking),
    index("idx_hot_topics_platform_data_source_ranking").on(table.platform, table.dataSource, table.ranking),
    uniqueIndex("uq_hot_topics_source_record").on(table.platform, table.sourceRecordId),
    index("idx_hot_topics_source_agent_collect_time").on(table.sourceAgent, table.collectTime),
  ],
);

export const hotTopicAnalysis = sqliteTable(
  "hot_topic_analysis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hotTopicId: integer("hot_topic_id").notNull().references(() => hotTopics.id, {
      onDelete: "cascade",
    }),
    relevanceScore: real("relevance_score").notNull(),
    recommendFollow: integer("recommend_follow", { mode: "boolean" }).notNull().default(false),
    recommendationReason: text("recommendation_reason").notNull(),
    recommendedTitle: text("recommended_title").notNull(),
    shootingDirection: text("shooting_direction").notNull(),
    liveTheme: text("live_theme").notNull(),
    analysisSource: text("analysis_source").notNull().default("WorkBuddy热点监测报告"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_hot_topic_analysis_topic_source").on(table.hotTopicId, table.analysisSource),
    index("idx_hot_topic_analysis_topic_id").on(table.hotTopicId),
    index("idx_hot_topic_analysis_recommend_score").on(table.recommendFollow, table.relevanceScore),
  ],
);

export const hotTopicFeedback = sqliteTable(
  "hot_topic_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hotTopicId: integer("hot_topic_id").notNull().references(() => hotTopics.id, {
      onDelete: "cascade",
    }),
    recommendedAt: text("recommended_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    recommendedContent: text("recommended_content", { mode: "json" })
      .$type<{
        shortVideoTitle: string;
        contentDirection: string;
        scriptDirection: string;
        liveTheme: string;
      }>()
      .notNull(),
    socialPostId: integer("social_post_id").references(() => socialPosts.id, {
      onDelete: "set null",
    }),
    relatedPostId: integer("related_post_id").references(() => socialPosts.id, {
      onDelete: "set null",
    }),
    platform: text("platform").notNull(),
    publishTime: text("publish_time"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    effectScore: real("effect_score"),
    aiSummary: text("ai_summary"),
    isEffective: integer("is_effective", { mode: "boolean" }),
    evaluatedAt: text("evaluated_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_hot_topic_feedback_topic_recommended").on(table.hotTopicId, table.recommendedAt),
    index("idx_hot_topic_feedback_social_post").on(table.socialPostId),
    index("idx_hot_topic_feedback_related_post").on(table.relatedPostId),
    index("idx_hot_topic_feedback_platform_publish").on(table.platform, table.publishTime),
    index("idx_hot_topic_feedback_effect_score").on(table.effectScore),
    index("idx_hot_topic_feedback_effective").on(table.isEffective),
  ],
);

export const hotTopicArchive = sqliteTable(
  "hot_topic_archive",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    archiveDate: text("archive_date").notNull(),
    hotTopicId: integer("hot_topic_id").notNull().references(() => hotTopics.id, {
      onDelete: "restrict",
    }),
    topicName: text("topic_name").notNull(),
    platform: text("platform").notNull(),
    topicType: text("topic_type").notNull().default("hot_rank"),
    heatValue: real("heat_value").notNull().default(0),
    aiScore: real("ai_score"),
    recommendationLevel: text("recommendation_level").notNull().default("C"),
    recommendedTitle: text("recommended_title"),
    contentDirection: text("content_direction"),
    relatedPostId: integer("related_post_id").references(() => socialPosts.id, {
      onDelete: "set null",
    }),
    effectScore: real("effect_score"),
    generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_hot_topic_archive_date_topic").on(table.archiveDate, table.hotTopicId),
    index("idx_hot_topic_archive_date_platform").on(table.archiveDate, table.platform),
    index("idx_hot_topic_archive_type_date").on(table.topicType, table.archiveDate),
    index("idx_hot_topic_archive_level_score").on(table.recommendationLevel, table.effectScore),
  ],
);

export const hotTopicData = sqliteTable(
  "HOT_TOPIC_DATA",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    rank: integer("rank").notNull(),
    topicTitle: text("topic_title").notNull(),
    heatValue: text("heat_value").notNull(),
    keyword: text("keyword").notNull(),
    url: text("url"),
    publishTime: text("publish_time"),
    category: text("category"),
    sourceAgent: text("source_agent").notNull(),
    aiRelevanceScore: real("ai_relevance_score"),
    aiAnalysis: text("ai_analysis", { mode: "json" }).$type<Record<string, unknown> | null>(),
    aiRecommendation: text("ai_recommendation", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (table) => [
    uniqueIndex("uq_hot_topic_data_source_topic").on(table.sourceAgent, table.platform, table.topicTitle, table.publishTime),
    index("idx_hot_topic_data_platform_rank").on(table.platform, table.rank),
    index("idx_hot_topic_data_relevance").on(table.aiRelevanceScore),
  ],
);

export const competitorAccounts = sqliteTable(
  "competitor_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    accountName: text("account_name").notNull(),
    accountUrl: text("account_url").notNull(),
    followers: integer("followers").notNull().default(0),
    industry: text("industry"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_competitor_accounts_platform_url").on(
      table.platform,
      table.accountUrl,
    ),
  ],
);

export const competitorPosts = sqliteTable(
  "competitor_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    accountName: text("account_name").notNull(),
    title: text("title").notNull(),
    publishTime: text("publish_time").notNull(),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    sourceType: text("source_type").notNull().default("api"),
    sourceRecordId: text("source_record_id"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_competitor_posts_platform_publish_time").on(table.platform, table.publishTime),
    index("idx_competitor_posts_account_publish_time").on(table.accountName, table.publishTime),
    uniqueIndex("uq_competitor_posts_source_record").on(table.platform, table.sourceRecordId),
  ],
);

export const viralVideos = sqliteTable(
  "viral_videos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    category: text("category").notNull(),
    accountName: text("account_name"),
    title: text("title").notNull(),
    publishTime: text("publish_time").notNull(),
    videoUrl: text("video_url"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    videoStructure: text("video_structure"),
    titlePattern: text("title_pattern"),
    firstThreeSeconds: text("first_three_seconds"),
    shootingMethod: text("shooting_method"),
    interactionMethod: text("interaction_method"),
    commentFeedback: text("comment_feedback"),
    breakoutReason: text("breakout_reason"),
    replicableElements: text("replicable_elements"),
    dushanziSuggestion: text("dushanzi_suggestion"),
    sourceType: text("source_type").notNull().default("manual"),
    sourceRecordId: text("source_record_id"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    collectionLogId: integer("collection_log_id").references(() => collectionLogs.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_viral_videos_category_publish_time").on(table.category, table.publishTime),
    index("idx_viral_videos_platform_views").on(table.platform, table.views),
    uniqueIndex("uq_viral_videos_source_record").on(table.platform, table.sourceRecordId),
  ],
);

export const contentTasks = sqliteTable(
  "content_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskDate: text("task_date").notNull(),
    platform: text("platform").notNull(),
    taskTitle: text("task_title").notNull(),
    contentType: text("content_type").notNull(),
    responsiblePerson: text("responsible_person"),
    collaborators: text("collaborators", { mode: "json" }).$type<string[]>().notNull().default([]),
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: integer("source_id"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("planning"),
    relatedPostId: integer("related_post_id").references(() => socialPosts.id, { onDelete: "set null" }),
    reviewResult: text("review_result"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_content_tasks_date_status").on(table.taskDate, table.status),
    index("idx_content_tasks_responsible_person").on(table.responsiblePerson),
    index("idx_content_tasks_source").on(table.sourceType, table.sourceId),
    index("idx_content_tasks_related_post").on(table.relatedPostId),
  ],
);

export const contentPlans = sqliteTable(
  "content_plans",
  {
    planId: integer("plan_id").primaryKey({ autoIncrement: true }),
    hotTopicId: integer("hot_topic_id").notNull().references(() => hotTopics.id, { onDelete: "restrict" }),
    taskId: integer("task_id").references(() => contentTasks.id, { onDelete: "set null" }),
    relatedPostId: integer("related_post_id").references(() => socialPosts.id, { onDelete: "set null" }),
    platform: text("platform").notNull().default("douyin"),
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    titleOptions: text("title_options", { mode: "json" }).$type<string[]>().notNull().default([]),
    script: text("script").notNull(),
    shotList: text("shot_list", { mode: "json" }).$type<Array<{ shot: number; scene: string; visual: string; voiceover: string; duration: string }>>().notNull().default([]),
    coverText: text("cover_text").notNull(),
    hashtags: text("hashtags", { mode: "json" }).$type<string[]>().notNull().default([]),
    recommendedTopics: text("recommended_topics", { mode: "json" }).$type<string[]>().notNull().default([]),
    backgroundMusic: text("background_music"),
    publishTime: text("publish_time").notNull(),
    liveTheme: text("live_theme"),
    targetViews: integer("target_views").notNull().default(0),
    targetInteractionRate: real("target_interaction_rate").notNull().default(0),
    targetFansGrowth: integer("target_fans_growth").notNull().default(0),
    status: text("status").notNull().default("draft"),
    createdTime: text("created_time").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedTime: text("updated_time").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_content_plans_topic_platform").on(table.hotTopicId, table.platform),
    index("idx_content_plans_status_publish_time").on(table.status, table.publishTime),
    index("idx_content_plans_task_id").on(table.taskId),
    index("idx_content_plans_related_post_id").on(table.relatedPostId),
  ],
);

export const contentPlanFeedback = sqliteTable(
  "content_plan_feedback",
  {
    planId: integer("plan_id").primaryKey().references(() => contentPlans.planId, { onDelete: "cascade" }),
    postId: integer("post_id").notNull().references(() => socialPosts.id, { onDelete: "restrict" }),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    effectScore: real("effect_score").notNull().default(0),
    aiSummary: text("ai_summary").notNull(),
    evaluatedAt: text("evaluated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_content_plan_feedback_post_id").on(table.postId),
    index("idx_content_plan_feedback_effect_score").on(table.effectScore),
  ],
);
