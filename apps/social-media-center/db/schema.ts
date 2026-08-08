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

export const socialComments = sqliteTable(
  "social_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade", onUpdate: "cascade" }),
    platform: text("platform").notNull(),
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
    topicName: text("topic_name").notNull(),
    keyword: text("keyword").notNull(),
    heatValue: real("heat_value").notNull().default(0),
    trend: text("trend").notNull().default("new"),
    category: text("category"),
    relatedDegree: real("related_degree"),
    aiSuggestion: text("ai_suggestion"),
    status: text("status").notNull().default("active"),
    collectTime: text("collect_time").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_hot_topics_platform_name").on(table.platform, table.topicName),
    index("idx_hot_topics_platform_collect_time").on(table.platform, table.collectTime),
    index("idx_hot_topics_related_degree").on(table.relatedDegree),
    index("idx_hot_topics_status_heat").on(table.status, table.heatValue),
    index("idx_hot_topics_keyword").on(table.keyword),
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

export const contentTasks = sqliteTable(
  "content_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskDate: text("task_date").notNull(),
    platform: text("platform").notNull(),
    taskTitle: text("task_title").notNull(),
    contentType: text("content_type").notNull(),
    responsiblePerson: text("responsible_person"),
    status: text("status").notNull().default("idea"),
    reviewResult: text("review_result"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_content_tasks_date_status").on(table.taskDate, table.status),
    index("idx_content_tasks_responsible_person").on(table.responsiblePerson),
  ],
);
