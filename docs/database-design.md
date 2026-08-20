# 新媒体运营中心数据库设计

> 核对基线：`apps/social-media-center/db/schema.ts` 与 `db/bootstrap.ts`，2026-08-20。
> 数据库：Cloudflare D1（SQLite 语义）；JSON/数组字段以 `TEXT` 存储序列化 JSON。
> 本文只记录现有结构，不代表本次文档工作修改了数据库。

## 1. 关系总览

```mermaid
erDiagram
  social_accounts ||--o{ social_posts : publishes
  social_accounts ||--o{ social_fans : snapshots
  social_accounts ||--o{ fan_growth_records : grows
  social_accounts ||--o{ fan_collection_batches : collects
  fan_collection_batches ||--o| social_fans : creates
  fan_collection_batches ||--o{ fan_growth_records : contains
  fan_collection_batches ||--o{ fan_profile_records : contains
  social_posts ||--o{ social_post_snapshots : snapshots
  content_collection_files ||--o| collection_logs : completes_as
  social_post_snapshots ||--o{ social_post_metric_series : contains
  social_post_snapshots ||--o| social_post_traffic : traffic
  social_post_snapshots ||--o{ social_post_traffic_sources : sources
  social_post_snapshots ||--o{ social_post_paid_traffic : paid_traffic
  social_post_snapshots ||--o{ social_post_audience : audience
  social_post_snapshots ||--o{ content_audience_analysis : audience
  social_post_snapshots ||--o{ social_post_comment_keywords : keywords
  social_posts ||--o{ social_comments : has
  social_comments ||--o{ social_comment_replies : replies
  data_import_logs ||--o{ social_posts : imports
  collection_logs ||--o{ collection_staging_records : stages
  collection_logs ||--o{ social_posts : collects
  collection_logs ||--o{ social_comments : collects
  collection_logs ||--o{ social_fans : collects
  collection_logs ||--o{ fan_growth_records : collects
  hot_topics ||--o{ hot_topic_analysis : analyzed_by
  hot_topics ||--o{ hot_topic_feedback : reviewed_by
  social_posts ||--o{ hot_topic_feedback : linked_to
  hot_topics ||--o{ hot_topic_archive : archived_as
  hot_topics ||--o| content_plans : produces
  content_plans ||--o| content_plan_feedback : reviewed_by
  content_plans ||--o| content_tasks : creates
  social_posts ||--o{ content_tasks : fulfills
```

## 2. 账号、作品、评论与粉丝

### 2.1 `social_accounts`

用途：保存景区在各平台的账号主数据，是作品、粉丝快照和增长记录的父表。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 内部账号编号 |
| `platform` | TEXT | 平台代码：`douyin` / `kuaishou` / `weibo` |
| `account_name` | TEXT | 账号显示名称 |
| `account_id` | TEXT | 平台账号唯一标识 |
| `account_url` | TEXT NULL | 账号主页地址 |
| `followers_count` | INTEGER | 当前粉丝数缓存 |
| `following_count` | INTEGER | 关注数 |
| `likes_count` | INTEGER | 账号累计获赞 |
| `status` | TEXT | 账号状态，默认 `active` |
| `created_at` / `updated_at` | TEXT | 创建和更新时间 |

约束：`platform + account_id` 唯一。来源包括初始化、抖音确认入库和人工维护。主要供驾驶舱、内容监测和粉丝分析使用。

### 2.2 `social_posts`

用途：作品主表，只保存平台作品标识和相对稳定的内容元数据。每次采集的播放、互动与分析指标写入快照及明细表，避免覆盖历史。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 作品编号 |
| `account_id` | INTEGER FK | 关联 `social_accounts.id` |
| `platform` / `source` | TEXT | 平台与数据来源 |
| `platform_post_id` | TEXT NULL | 平台作品唯一标识；`platform + platform_post_id` 唯一 |
| `title` / `content_type` | TEXT | 标题与内容类型 |
| `publish_time` | TEXT | 平台发布时间 |
| `post_url` / `video_url` / `cover_url` | TEXT NULL | 作品详情、作品和封面地址 |
| `post_type` / `post_status` / `is_pinned` | TEXT / INTEGER | 平台原始类型、状态和置顶标记 |
| `hashtags` | TEXT(JSON) | 标签数组 |
| `duration` / `duration_seconds` | INTEGER / REAL NULL | 时长兼容字段与秒数 |
| `content_metadata` | TEXT(JSON) NULL | WorkBuddy 实际内容元数据原文 |
| `data_availability_status` | TEXT | `available / partial / expired / unavailable` |
| `views` 等旧指标字段 | INTEGER | 兼容旧接口的最新值缓存；历史分析以快照表为准 |
| `ai_analysis` | TEXT(JSON) NULL | 作品分析扩展结果 |
| `import_log_id` | INTEGER FK NULL | Excel/图片导入日志 |
| `collection_log_id` | INTEGER FK NULL | 自动/API 采集日志 |
| `created_at` / `updated_at` | TEXT | 创建和更新时间 |

约束：保留旧的 `account_id + title` 唯一约束，同时增加 `platform + platform_post_id` 唯一约束。相同平台作品再次采集时更新主记录并新增快照，不创建重复作品。

#### 2.2.1 `social_post_snapshots`

用途：每次采集的作品表现快照，保存播放、点赞、平台评论总数、收藏、分享、涨粉以及各详情模块可用状态。`post_id + snapshot_time` 唯一。

关键字段包括 `play_count`、`like_count`、`comment_overview_count`、`actual_loaded_count`、`comment_rows_count`、`favorite_count`、`share_count`、`follower_gain`、`post_age_days`、六类 `*_availability_status`、`source_record_status`、`source_failure_reason`、`source_file` 和 `raw_payload`。`comment_overview_count` 是平台累计评论数，`actual_loaded_count` 是页面本次声明的实际加载数，`comment_rows_count` 是 JSON 中实际评论行数，三个口径分别保存。私密作品的指标保持 `NULL`，状态单独保存为 `private`。

#### 2.2.2 `content_collection_files`

用途：登记 WorkBuddy 原始作品文件的只读处理状态。保存 `file_name`、`full_path`、SHA-256 `checksum`、文件大小、源采集日期/时间/批次、作品数、完整度、检测/校验/处理时间、`detected / validated / processing / completed / failed` 状态、采集日志和错误信息。`checksum` 唯一，已完成文件禁止重复写入；该表不保存或改写原始文件内容。

#### 2.2.3 `social_post_metric_series`

用途：保存 WorkBuddy 从作品图表真实读取的时间序列点。每行包含作品、快照、指标类型、序列名称、`point_index`、真实存在时才保存的 `point_time` / `point_label`、指标值、单位、源 JSON 路径和原始值。无时间轴的图表只保留点序，不人工推算时间。

#### 2.2.4 `social_post_traffic`

用途：作品每个快照的流量分析。保存完播率、平均播放时长、2 秒跳出率、5 秒完播率、划走率以及图文详情页实际出现的点击、展开、互动等指标。缺失或超过抖音有效期的字段保持 `NULL`，状态保存为 `partial / expired / unavailable`，禁止写 0。

#### 2.2.5 `social_post_traffic_sources`

用途：保存每个快照的自然、搜索、推荐及其他平台流量来源明细。`traffic_nature` 区分 `organic` 和 `other`；付费投流不混入本表。

#### 2.2.6 `social_post_paid_traffic`

用途：独立保存 DOU+ 等付费流量。关键字段为 `campaign_type`、`play_count`、`relationship_to_overview`（`additional / included / unknown`）、详情可用状态、原始数据和采集日志。只有源页面明确口径时才计算合计曝光；未知关系不从播放量中反推自然播放。

#### 2.2.7 `social_post_audience`

用途：保存 WorkBuddy V2.1 的作品级观众画像快照。采用 `dimension_type + dimension_name` 通用行结构，支持性别、年龄、地域、兴趣、设备、活跃度、关注关键词和其他真实维度，并保存数值、占比、排名、原始值和可用状态。该表与账号级 `fan_profile_records` 严格分离。

#### 2.2.8 `social_post_comment_keywords`

用途：保存平台真实提供的作品评论热词及排名。包含 `keyword`、`ranking`、`occurrence_count`、`sentiment`、`category` 和可用状态。没有热词页的作品仅在快照表标记不可用，不生成空热词或模拟热词。

### 2.3 `social_comments`

用途：保存作品评论原文及规则分析结果。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 评论编号 |
| `post_id` | INTEGER FK | 关联 `social_posts.id`，作品删除时级联 |
| `platform` / `source` | TEXT | 平台与来源 |
| `source_comment_id` / `comment_fingerprint` | TEXT NULL | 平台 ID 或稳定去重指纹 |
| `snapshot_id` / `snapshot_time` | FK / TEXT NULL | 首次读取该评论的作品快照 |
| `username` | TEXT | 评论用户显示名 |
| `comment_text` | TEXT NULL | 评论正文；图片/表情无文字时允许为空 |
| `comment_type` | TEXT | `text / image / emoji / mixed / other` |
| `comment_time` / `comment_time_raw` | TEXT NULL | 标准时间和平台相对时间原文 |
| `likes` / `reply_count` | INTEGER NULL / INTEGER | 评论点赞和回复数量；点赞不可读时为 NULL |
| `likes_availability_status` / `likes_raw_value` | TEXT / TEXT(JSON) NULL | 区分真实 0 与平台未提供，并保留原始值 |
| `is_author` / `author_replied` | INTEGER NULL | 作者身份和作者是否回复；未知保持 NULL |
| `sentiment` | TEXT | 情绪标签，初始可为 `unknown` |
| `keyword` | TEXT NULL | 提取关键词 |
| `user_need` | TEXT NULL | 游客需求分类 |
| `ai_analysis` | TEXT(JSON) NULL | 引擎、置信度、规则命中等分析详情 |
| `ai_reply` | TEXT NULL | 回复建议 |
| `collection_log_id` | INTEGER FK NULL | 采集批次 |
| `created_at` | TEXT | 入库时间 |

来源：WorkBuddy 作品详情、抖音评论确认或统一评论接口。主要供游客评论洞察、内容监测和作品详情使用。平台评论总量和页面实际加载量保存在快照表，本表只保存 JSON 中真实存在的评论明细。

### 2.3.1 `social_comment_replies`

用途：预留并保存 WorkBuddy 原始文件真实提供的评论回复明细，通过 `comment_id` 关联父评论。字段包含平台回复 ID/指纹、用户名、可为空的正文、评论类型、标准/原始时间、点赞、作者身份、原始 JSON 和采集日志。当前首批 V2.1 源文件只有回复数量、没有回复正文，因此写入 0 行，不生成模拟回复。

### 2.4 `content_audience_analysis`（兼容）

用途：保存单个作品的观众画像。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 分析编号 |
| `post_id` | INTEGER FK | 作品编号，同一作品可有多个采集快照 |
| `platform` | TEXT | 平台 |
| `snapshot_id` / `snapshot_time` | FK / TEXT | 作品采集快照 |
| `dimension_type` / `dimension_name` | TEXT | 性别、年龄、地域、兴趣、设备、粉丝关系、新老观众等实际维度 |
| `dimension_value` / `percentage` / `ranking` | REAL / INTEGER NULL | 原始指标、占比和排名 |
| `gender_distribution` 等旧字段 | TEXT(JSON) | V1 兼容字段，V2 新数据采用通用维度行 |
| `data_availability_status` | TEXT | 数据可用状态 |
| `source_type` / `source_record_id` | TEXT | 来源类型与来源记录标识 |
| `raw_payload` | TEXT(JSON) NULL | 原始数据留存 |
| `collection_log_id` | INTEGER FK NULL | 采集批次 |
| `collected_at` | TEXT | 源数据采集时间 |
| `created_at` / `updated_at` | TEXT | 创建和更新时间 |

来源：早期 WorkBuddy 抖音作品详情和 V2 兼容接口。深度 V2.1 新数据写入 `social_post_audience`；本表保留给已有接口和历史记录，不与账号粉丝画像 `fan_profile_records` 混用。

### 2.5 `social_fans`

用途：保存账号级粉丝快照。V2.0 后画像明细不再写入本表 JSON 字段；旧字段仅为历史兼容。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 快照编号 |
| `account_id` | INTEGER FK | 关联账号 |
| `platform` | TEXT | 平台 |
| `account_name` / `snapshot_date` | TEXT | 快照账号名称和日期 |
| `fans_count` | INTEGER | 快照时粉丝总量 |
| `display_fans_count` | TEXT NULL | 平台缩写展示值，不覆盖精确粉丝数 |
| `male_ratio` / `female_ratio` | REAL NULL | 账号快照的性别比例 |
| `collection_time` / `data_period` | TEXT | 采集时间和原始周期集合 |
| `gender_distribution` 等旧字段 | TEXT(JSON) | V1历史兼容；V2新画像写入明细表 |
| `source_type` / `source_record_id` | TEXT | 来源类型和外部唯一标识 |
| `raw_payload` | TEXT(JSON) NULL | 原始快照 |
| `batch_id` | INTEGER FK NULL | 关联粉丝采集批次 |
| `collection_log_id` | INTEGER FK NULL | 采集批次 |
| `collected_at` / `created_at` | TEXT | 采集与入库时间 |

来源：抖音创作者中心真实采集、V3、API 或人工数据。主要供粉丝分析、运营驾驶舱使用。

### 2.6 `fan_growth_records`

用途：保存 daily、7d、30d、natural_month、custom 五类真实增长记录；区间汇总不会伪装成每日趋势。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 记录编号 |
| `account_id` | INTEGER FK | 关联账号 |
| `platform` | TEXT | 平台 |
| `record_date` | TEXT | V1兼容日期，V2查询以 `period_end` 为准 |
| `batch_id` / `snapshot_date` | INTEGER FK / TEXT | 采集批次和账号快照日期 |
| `period_type` | TEXT | `daily` / `7d` / `30d` / `natural_month` / `custom` |
| `period_start` / `period_end` | TEXT NULL | 平台实际提供的统计起止日期 |
| `fans_count` | INTEGER | 本次采集的精确账号粉丝数 |
| `net_growth` | INTEGER | 净增，可为负 |
| `new_fans` / `lost_fans` | INTEGER | V1兼容字段 |
| `new_followers` / `lost_followers` | INTEGER NULL | V2吸粉与脱粉 |
| `returning_followers` | INTEGER NULL | 回访粉丝量 |
| `collection_time` | TEXT NULL | 实际采集时间 |
| `source_type` / `source_record_id` | TEXT | 来源与外部标识 |
| `raw_payload` | TEXT(JSON) NULL | 原始记录 |
| `collection_log_id` | INTEGER FK NULL | 采集批次 |
| `created_at` / `updated_at` | TEXT | 创建和更新时间 |

约束：同一非空 `batch_id + period_type` 唯一。粉丝中心只用 `daily` 记录绘制折线，周期卡读取完全匹配的区间记录。

### 2.7 `fan_collection_batches`

用途：记录每次粉丝采集批次，按 `platform + account_id + source_file` 防止同一文件重复入库。

| 字段 | 类型 | 作用 |
|---|---|---|
| `batch_id` | INTEGER PK | 批次编号 |
| `platform` / `account_id` | TEXT / INTEGER FK | 平台和账号 |
| `collection_date` / `source_file` | TEXT | 采集日期和来源文件 |
| `data_period` | TEXT(JSON) NULL | 本批次包含的真实周期 |
| `raw_metric_count` / `success_metric_count` | INTEGER | 原始与成功指标数 |
| `unavailable_metric_count` | INTEGER | 平台未提供的指标数 |
| `status` / `created_at` | TEXT | pending、completed、failed及创建时间 |

### 2.8 `fan_profile_records`

用途：以通用维度明细保存历史画像，每次采集新增记录，不覆盖旧快照。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` / `batch_id` | INTEGER PK / FK | 明细和采集批次 |
| `platform` / `account_id` / `snapshot_date` | TEXT / FK / TEXT | 平台、账号、快照日期 |
| `dimension_type` | TEXT | gender、age、region、interest、device、activity、follow_keyword、other |
| `dimension_name` | TEXT | 平台原始维度名称 |
| `dimension_value` / `percentage` | REAL NULL | 原始数值和百分比；不可用时为 NULL |
| `ranking` / `raw_value` | INTEGER / TEXT NULL | 平台顺序和原始显示值 |
| `collection_time` / `created_at` | TEXT | 采集与入库时间 |

缺失字段以 `dimension_type=other`、数值 NULL、`raw_value` 以 `unavailable` 开头保存，不转换为0。

## 3. 采集、暂存与导入日志

### 3.1 `collection_logs`

用途：记录每次 Chrome、Excel 或 API 数据采集/接收批次。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 批次编号 |
| `platform` | TEXT | 平台 |
| `source_type` | TEXT | `chrome` / `excel` / `api` |
| `source_name` / `source_url` | TEXT | 来源名称和可选地址 |
| `entity_type` | TEXT | 数据类型，如 post、comment、hot_topic |
| `status` | TEXT | 待确认、校验失败、已完成或失败等状态 |
| `total_count` / `success_count` / `error_count` | INTEGER | 总数、成功数、错误数 |
| `comment_count` | INTEGER | 评论采集数 |
| `error_message` | TEXT NULL | 错误或重复跳过摘要 |
| `collected_at` | TEXT NULL | 源采集时间 |
| `created_at` / `updated_at` | TEXT | 日志时间 |

主要供数据采集中心、数据新鲜度提示和故障排查使用。

### 3.2 `collection_staging_records`

用途：统一 V2 API 的逐条暂存区，支持预览、人工确认和整批校验。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 暂存记录编号 |
| `collection_log_id` | INTEGER FK | 所属 `collection_logs`，删除批次时级联 |
| `record_index` | INTEGER | 源批次行号 |
| `data_type` | TEXT | `hot_topic` / `content` / `comment` |
| `platform` / `source` | TEXT | 标准平台与来源 |
| `normalized_payload` | TEXT(JSON) NULL | 标准化结果 |
| `raw_payload` | TEXT(JSON) | 原始记录 |
| `validation_status` | TEXT | `valid` / `invalid` |
| `validation_errors` | TEXT(JSON) | 错误列表 |
| `confirmed_at` | TEXT NULL | 人工确认时间 |
| `created_at` | TEXT | 暂存时间 |

约束：`collection_log_id + record_index` 唯一。该表不是业务事实表，确认后仍保留用于审计。

### 3.3 `data_import_logs`

用途：记录 Excel 与图片人工导入。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 导入编号 |
| `platform` | TEXT | 平台 |
| `file_name` | TEXT | 文件名 |
| `import_type` | TEXT | `excel` / `image` |
| `status` | TEXT | 导入状态 |
| `success_count` / `error_count` | INTEGER | 成功和错误数量 |
| `created_at` | TEXT | 导入时间 |

图片导入当前用于上传留档和人工确认，不代表已完成 OCR。

## 4. 热点、分析、复盘与档案

### 4.1 `hot_topics`

用途：标准化热点事实表，也是热点监测主数据源。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 热点编号 |
| `platform` | TEXT | 平台 |
| `topic_type` | TEXT | 热点榜、种草榜、挑战榜或内容热点等类型 |
| `data_source` / `source` | TEXT | 细分数据源与来源系统 |
| `topic_name` / `keyword` | TEXT | 热点名称和关键词 |
| `heat_value` / `ranking` | INTEGER | 热度与榜单排名 |
| `trend` / `category` | TEXT | 趋势与分类 |
| `related_degree` | INTEGER | 兼容的景区关联度字段 |
| `ai_suggestion` | TEXT NULL | 兼容的建议文本 |
| `status` | TEXT | 启用状态 |
| `source_url` / `source_record_id` | TEXT NULL | 源链接与源记录标识 |
| `source_agent` | TEXT NULL | Agent 名称 |
| `hot_score` | INTEGER NULL | 兼容的热点评分 |
| `recommended_topic` / `video_direction` / `publish_time_suggestion` | TEXT NULL | 兼容的选题、方向和发布时间建议 |
| `raw_payload` | TEXT(JSON) NULL | 原始热点记录 |
| `collection_log_id` | INTEGER FK NULL | 采集批次 |
| `collect_time` / `collection_date` | TEXT | 精确采集时间与北京时间快照日期 |
| `created_at` | TEXT | 入库时间 |

约束：`platform + data_source + topic_name + collection_date` 唯一。主要供热点监测、内容策划、内容分析和档案使用。

### 4.2 `hot_topic_analysis`

用途：与原始热点分离保存 AI/规则分析结果。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 分析编号 |
| `hot_topic_id` | INTEGER FK | 关联 `hot_topics.id`，热点删除时级联 |
| `relevance_score` | INTEGER | 与独山子大峡谷关联度 0–100 |
| `recommend_follow` | INTEGER/BOOLEAN | 是否建议跟进 |
| `recommendation_reason` | TEXT | 推荐或不推荐理由 |
| `recommended_title` | TEXT | 推荐短视频标题 |
| `shooting_direction` | TEXT | 拍摄方向 |
| `live_theme` | TEXT | 直播主题 |
| `analysis_source` | TEXT | 分析来源/版本 |
| `created_at` | TEXT | 分析时间 |

约束：`hot_topic_id + analysis_source` 唯一。热点页面按热点 ID 读取最新分析，不覆盖 `hot_topics` 原始数据。

### 4.3 `hot_topic_feedback`

用途：关联热点推荐与已发布作品，沉淀效果复盘。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 复盘编号 |
| `hot_topic_id` | INTEGER FK | 来源热点 |
| `recommended_at` | TEXT | 推荐时间 |
| `recommended_content` | TEXT(JSON) | 标题、方向、脚本和直播主题 |
| `social_post_id` / `related_post_id` | INTEGER FK NULL | 兼容字段与当前关联作品 |
| `platform` / `publish_time` | TEXT | 平台和作品发布时间 |
| `views` / `likes` / `comments` / `favorites` / `shares` | INTEGER | 关联作品效果快照 |
| `effect_score` | INTEGER NULL | 效果评分 |
| `ai_summary` | TEXT NULL | 复盘结论 |
| `is_effective` | INTEGER/BOOLEAN NULL | 推荐是否有效 |
| `evaluated_at` | TEXT NULL | 评价时间 |
| `created_at` / `updated_at` | TEXT | 创建和更新时间 |

主要供热点效果复盘、内容监测热点关联和热点档案使用。

### 4.4 `hot_topic_archive`

用途：保存每日热点分析快照，避免历史展示依赖实时关联表变化。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 档案编号 |
| `archive_date` | TEXT | 档案日期 |
| `hot_topic_id` | INTEGER FK | 原热点 |
| `topic_name` / `platform` / `topic_type` | TEXT | 热点快照信息 |
| `heat_value` / `ai_score` | INTEGER | 热度与 AI 分数 |
| `recommendation_level` | TEXT | A / B / C |
| `recommended_title` / `content_direction` | TEXT NULL | 推荐标题和内容方向 |
| `related_post_id` | INTEGER FK NULL | 关联作品 |
| `effect_score` | INTEGER NULL | 复盘评分 |
| `generated_at` | TEXT | 档案生成时间 |

约束：`archive_date + hot_topic_id` 唯一。页面支持日期、平台、类型筛选，R2 保存对应 Excel。

### 4.5 `HOT_TOPIC_DATA`

用途：早期 AI Agent 数据接入兼容表，保存 WorkBuddy 原始热点及内嵌分析。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 记录编号 |
| `platform` / `rank` | TEXT / INTEGER | 平台与排名 |
| `topic_title` / `heat_value` / `keyword` | TEXT | 标题、原始热度文本和关键词 |
| `url` / `publish_time` / `category` | TEXT | 链接、时间和分类 |
| `source_agent` | TEXT | 固定或传入的 Agent 来源 |
| `ai_relevance_score` | INTEGER | 关联评分 |
| `ai_analysis` / `ai_recommendation` | TEXT(JSON) | 分析与推荐 |

当前业务主链应优先使用 `hot_topics + hot_topic_analysis`；该表保留兼容性，不应与标准表混为同一事实源。

## 5. 内容策划、任务与反馈

### 5.1 `content_plans`

用途：保存 A 级热点生成的内容方案。

| 字段 | 类型 | 作用 |
|---|---|---|
| `plan_id` | INTEGER PK | 方案编号 |
| `hot_topic_id` | INTEGER FK | 来源热点 |
| `task_id` / `related_post_id` | INTEGER FK NULL | 生成的任务和发布作品 |
| `platform` / `content_type` | TEXT | 平台与内容类型 |
| `title` | TEXT | 主标题 |
| `title_options` | TEXT(JSON) | 5 个候选标题 |
| `script` | TEXT | 视频脚本 |
| `shot_list` | TEXT(JSON) | 拍摄分镜 |
| `cover_text` | TEXT | 封面文案 |
| `hashtags` / `recommended_topics` | TEXT(JSON) | 标签与话题 |
| `background_music` | TEXT NULL | 背景音乐建议 |
| `publish_time` / `live_theme` | TEXT | 推荐发布时间和可选直播主题 |
| `target_views` | INTEGER | 目标播放量 |
| `target_interaction_rate` | REAL | 目标互动率 |
| `target_fans_growth` | INTEGER | 目标涨粉 |
| `status` | TEXT | 方案状态 |
| `created_time` / `updated_time` | TEXT | 创建和更新时间 |

约束：`hot_topic_id + platform` 唯一。当前生成接口仅支持抖音 A 级热点。

### 5.2 `content_plan_feedback`

用途：保存内容方案与作品的 7 日效果复盘。

| 字段 | 类型 | 作用 |
|---|---|---|
| `plan_id` | INTEGER PK/FK | 关联 `content_plans` |
| `post_id` | INTEGER FK UNIQUE | 关联作品 |
| `views` / `likes` / `comments` / `favorites` / `shares` | INTEGER | 作品效果快照 |
| `effect_score` | INTEGER | 方案效果评分 |
| `ai_summary` | TEXT | 是否达标、原因和后续建议 |
| `evaluated_at` | TEXT | 评价时间 |

### 5.3 `content_tasks`

用途：八阶段内容生产任务。

| 字段 | 类型 | 作用 |
|---|---|---|
| `id` | INTEGER PK | 任务编号 |
| `task_date` | TEXT | 截止日期 |
| `platform` / `task_title` / `content_type` | TEXT | 平台、任务名称、内容类型 |
| `responsible_person` | TEXT NULL | 负责人 |
| `collaborators` | TEXT(JSON) | 协助人列表 |
| `source_type` / `source_id` | TEXT / INTEGER NULL | 热点、AI 策划、人工、节日活动等来源 |
| `priority` | TEXT | 优先级 |
| `status` | TEXT | 八阶段状态 |
| `related_post_id` | INTEGER FK NULL | 发布后关联作品 |
| `review_result` | TEXT NULL | 审核/执行分析摘要 |
| `completed_at` | TEXT NULL | 完成时间 |
| `created_at` / `updated_at` | TEXT | 创建和更新时间 |

主要供任务看板、营销运营中心和内容策划使用。

## 6. 竞品与爆款资产表

### 6.1 `competitor_accounts`

字段：`id`、`platform`、`account_name`、`account_url`、`followers`、`industry`、`created_at`。用途是竞品账号目录；当前没有稳定外部采集闭环。

### 6.2 `competitor_posts`

字段：`id`、`platform`、`account_name`、`title`、`publish_time`、`views`、`likes`、`comments`、`favorites`、`shares`、`source_type`、`source_record_id`、`raw_payload`、`collection_log_id`、`created_at`、`updated_at`。用途是同行作品对比；来源预留 API/Excel/手工和采集日志。

### 6.3 `viral_videos`

字段：`id`、`platform`、`category`、`account_name`、`title`、`publish_time`、`video_url`、五项互动指标、`video_structure`、`title_pattern`、`first_three_seconds`、`shooting_method`、`interaction_method`、`comment_feedback`、`breakout_reason`、`replicable_elements`、`dushanzi_suggestion`、来源/原始数据/日志与时间字段。用途是沉淀旅游、景区、新疆旅游和自然风景爆款结构；当前属于基础数据结构，真实资产库仍待持续导入。

## 7. 删除与一致性规则

- 删除账号会级联粉丝快照和增长记录，但已有作品对账号使用 `RESTRICT`，避免误删事实数据。
- 删除作品会级联评论和观众分析；任务、热点反馈和策划关联需要先处理外键关系。
- 删除采集日志会级联暂存记录；业务表的 `collection_log_id` 一般设为 `NULL`，保留业务事实。
- 热点分析和反馈随热点删除级联；热点档案对热点使用限制删除，保护历史资产。
- 所有正式删除操作应先确认目标范围并备份；本次文档工作未执行任何删除或迁移。

## 8. 数据质量注意事项

1. `social_posts.comments` 是平台显示总量，`social_comments` 是实际采集明细，不能直接等同。
2. `fans_growth` 与同日净增只能作为内容吸粉信号，不能默认解释为严格因果。
3. 分布字段的 `value` 口径需由来源定义为百分比或人数，并在适配器中统一。
4. 热度值跨平台不可直接比较，平台内排序优先于跨平台绝对值。
5. `collect_time`、`publish_time`、`record_date` 与 `created_at` 用途不同，页面筛选必须使用业务时间字段。
6. `HOT_TOPIC_DATA` 与 `hot_topics` 并存时，页面和报表必须明确主数据源，防止重复统计。
