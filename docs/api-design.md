# 新媒体运营中心 API 设计与现状

> 核对范围：`apps/social-media-center/app/api/**/route.ts`，2026-08-18。
> 本文记录现有接口，不在本次文档工作中新增或修改 API。

## 1. 通用约定

- 基础路径与当前站点同源，响应主体通常为 JSON。
- 统一采集 V2 与热点分析导入使用采集密钥校验；生产环境应配置 `EXTERNAL_AGENT_API_KEY`，客户端通过约定请求头传递，禁止写入仓库。
- 日期筛选常用参数为 `from=YYYY-MM-DD`、`to=YYYY-MM-DD` 或周期参数，具体以接口返回的 `range` 为准。
- 平台代码为 `douyin`、`kuaishou`、`weibo`；展示层再映射为中文。
- 接收和预览不等于入库；明确人工确认是采集主链的安全边界。
- 错误响应包含 `error`，校验失败时可能附带 `errors` 或逐条预览结果。

## 2. 数据采集标准化 API

### 2.1 统一 V2.1 接收链路

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/data-collection/v2/receive` | GET | 返回接口契约 | 鉴权请求 | 支持的数据类型、平台、标准字段、限制 |
| `/api/data-collection/v2/receive` | POST | 接收、标准化、校验并暂存 | `dataType`、`source`、`collectedAt`、同平台 `records` | `batchId`、有效/错误数、前 20 条预览、确认地址、同日重复提示 |
| `/api/data-collection/v2/preview?id={batchId}` | GET | 读取完整批次预览 | 批次 ID | 日志、标准化记录、校验状态与错误 |
| `/api/data-collection/v2/confirm?id={batchId}` | POST | 人工确认后事务写入 | `{ "confirmed": true, "duplicate_mode": "overwrite|skip" }` | 目标表、写入/新增/更新/跳过数量 |
| `/api/data-collection/v2/logs` | GET | 查询采集批次 | 分页/筛选参数（按实现） | 采集日志列表 |

统一字段：

```json
{
  "dataType": "hot_topic | content | comment",
  "source": "WorkBuddy热点监测Agent",
  "collectedAt": "2026-08-18T08:00:00+08:00",
  "records": []
}
```

三类记录分别映射：

- 热点：`platform`、`source`、`topic_type`、`topic_name`、`ranking`、`heat_value`、`trend`、`keyword`、`collect_time`。
- 内容：`platform`、`source`、`account_id`、`title`、`publish_time`、`views`、`likes`、`comments`、`favorites`、`shares`。
- 评论：`platform`、`source`、`post_id`、`username`、`comment_text`、`comment_time`。

限制：JSON 请求体最大 2 MB、单批最多 500 条、一个批次只能有一个平台。内容必须关联有效账号，评论必须关联平台一致的已有作品。

### 2.2 抖音专用采集接口

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/collections/douyin-v3` | POST | V3 粉丝、作品、观众、评论数据无落库预览 | `schemaVersion=3.0` 的抖音标准 JSON | 标准化 `payload`、数量摘要、失败数 |
| `/api/collections/douyin-v3/confirm` | POST | 明确确认后批量写入 | `{ confirmed: true, payload }` | 日志 ID、粉丝/增长/作品/观众/评论写入数 |
| `/api/collections/fans-v2` | POST | 粉丝真实数据 V2 预览、校验和分层映射 | 抖音粉丝原始 JSON | 账号快照、周期增长、画像明细、不可用字段和数量摘要 |
| `/api/collections/fans-v2/confirm` | POST | 粉丝真实数据 V2 确认入库 | `{ confirmed: true, payload }` | 批次 ID、四张表写入数、重复批次状态 |
| `/api/collections/douyin-v2` | POST | 兼容 V2.1 预览 | V2.1 采集 JSON | 完整率和无落库预览 |
| `/api/collections/douyin-v2/confirm` | POST | 兼容 V2.1 确认 | 确认标记与预览数据 | 写入与日志结果 |
| `/api/collections/comments` | POST | 独立评论采集预览 | 按作品组织的评论数据 | 预览、校验与日志 |
| `/api/collections/comments/confirm` | POST | 独立评论确认入库 | 确认标记与评论预览 | 新增、跳过与失败数量 |
| `/api/collections` | GET/POST/DELETE | 旧版采集日志、记录与批次删除/回滚兼容入口 | 查询参数或采集记录 | 日志/采集结果/删除结果 |
| `/api/collections/confirm` | POST | 旧版作品确认入口 | 确认数据 | 作品写入结果 |

V3 校验包括日期、抖音链接、非负指标、0–100 的完播/划走率、观众分布和评论字段；每个作品最多接收 50 条评论。该 API **接收采集结果，不在服务器内启动或控制抖音 App**。

粉丝 V2 接口按 `source_file + platform + account_id` 识别采集批次，同一批次不会重复写入。确认接口分别写入 `fan_collection_batches`、`social_fans`、`fan_growth_records` 和 `fan_profile_records`；平台未提供的指标保存为 `null / unavailable`，不会转换为 0。

### 2.3 人工数据导入

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/imports` | GET | 查询导入记录 | 筛选参数 | 导入日志 |
| `/api/imports` | POST | 上传 Excel 或图片 | `multipart/form-data` 文件和平台 | Excel 预览/校验；图片存储记录 |
| `/api/imports` | PATCH | 重新导入/状态操作 | 导入 ID 与动作 | 更新后的日志 |
| `/api/imports` | DELETE | 删除错误批次关联数据 | 导入 ID | 删除范围与结果 |
| `/api/imports/confirm` | POST | 人工确认导入 | 导入 ID、预览记录、确认标记 | `social_posts` 写入数或图片确认状态 |

Excel 作品字段经过映射和校验后入库；图片当前只上传 R2 并人工确认，没有复杂 OCR 服务。

## 3. 热点数据、分析、复盘与档案 API

### 3.1 标准热点与兼容导入

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/hot-topics` | GET | 查询标准热点 | `platform`、日期、`view`、`dataSource` 等 | 热点列表、平台统计、分析结果 |
| `/api/hot-topics` | POST | 人工新增热点 | 平台、名称、热度、趋势、分类等 | 新建热点 |
| `/api/hot-topics` | PATCH | 编辑热点 | `id` 与可编辑字段 | 更新热点 |
| `/api/hot-topics?id={id}` | DELETE | 删除指定热点 | 热点 ID | 删除记录；外键规则生效 |
| `/api/hot-topic/import` | GET | 返回 WorkBuddy 兼容导入契约 | 鉴权请求 | 文件类型、字段与数据集信息 |
| `/api/hot-topic/import` | POST | JSON/Excel 导入兼容表 | JSON 数组或文件；可选 `replace_existing` | `HOT_TOPIC_DATA` 接收/成功数 |
| `/api/hot-topic-analysis/import` | POST | 导入独立热点分析 | `source_agent`、`collection_date`、`analysis_source`、`analyses` | 匹配、写入、保留、未匹配数量 |

注意：当前热点监测业务主链读取 `hot_topics + hot_topic_analysis`。`/api/hot-topic/import` 写入的 `HOT_TOPIC_DATA` 是兼容数据集，不能代替统一 V2 确认流程。

### 3.2 抖音热点测试兼容接口

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/hot-topics/douyin/preview` | GET | 生成抖音热点测试预览 | 无 | 预览 token 与规则分析 |
| `/api/hot-topics/douyin/confirm` | POST | 基于当前预览确认入库 | `confirmed`、`previewToken` | 热点和日志结果 |

这组接口是历史测试路径，不应与 WorkBuddy 正式日常导入重复执行。

### 3.3 热点行动推荐与复盘

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/hot-topic-data` | GET | 读取热点与最新分析 | `platform`、`from`、`to` | 热点、A/B/C、推荐和转换评分 |
| `/api/hot-topic-data/analyze` | POST | 对单个热点执行规则分析 | `{ id }` | 关联度、跟进判断、标题、方向、直播主题 |
| `/api/hot-topic-data/generate` | POST | 为热点生成选题/复盘占位记录 | `{ id }` | 推荐内容和 `hot_topic_feedback` 记录 |
| `/api/hot-topic-feedback` | GET | 查询热点效果复盘 | 无 | 复盘列表、成功率和类型分析 |
| `/api/hot-topic-feedback` | PATCH | 关联已发布作品 | `feedbackId`、`postId` | 更新指标、效果评分和总结 |
| `/api/hot-topic-feedback` | PUT | 刷新全部已关联作品指标 | 无 | 刷新数量和最新复盘数据 |

### 3.4 热点档案

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/hot-topic-archive` | GET | 按日期、平台、类型查询档案 | `date`、`platform`、`topicType` | 档案行、日期、类型和汇总 |
| `/api/hot-topic-archive` | POST | 手动生成指定日档案 | `{ date }` | 归档数、文件名、下载地址 |
| `/api/hot-topic-archive/download` | GET | 下载 Excel | `date` | R2 中的 `.xlsx` 文件 |

当日档案为空时，GET/下载接口会尝试生成；Worker Cron 也会每日生成一次。

## 4. 驾驶舱、内容与粉丝 API

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/dashboard` | GET | 运营驾驶舱汇总 | 日期范围 | 平台 KPI、发布、排行、热点、任务和建议 |
| `/api/posts` | GET | 作品列表 | 平台、日期、排序等 | `social_posts` 列表 |
| `/api/content-monitoring` | GET | 内容监测驾驶舱 | `platform=douyin|kuaishou|weibo`、日期范围 | KPI、TOP10、爆款、低效诊断、热点关联 |
| `/api/insights/content` | GET | 内容分析汇总 | 平台、日期范围 | 内容类型、作品、AI 建议和平台状态 |
| `/api/insights/content/detail?id={postId}` | GET | 单作品详情 | 作品 ID | 流量/互动指标、观众画像、评论与热词 |
| `/api/insights/fans` | GET | 粉丝分析 V2.1 | `trend=7d|30d|month|custom`、日期范围 | 真实快照、周期增长、跨批次指标/画像/热词变化、期间作品、AI摘要和周报；缺失维度返回不可用状态 |
| `/api/ai-analysis` | GET | 规则型内容分析 | 日期范围 | 作品五维评分、平台建议、选题、日报/周报 |
| `/api/comment-insights` | GET | 查询评论洞察 | 日期范围 | 情绪、关键词、需求、建议 |
| `/api/comment-insights` | POST | 执行并回写评论规则分析 | 日期范围 | 刷新后的洞察结果 |

`/api/insights/fans` 返回的 `collectionApi` 指向 `/api/collections/fans-v2`。增长图只读取 `period_type=daily` 的真实时间点，7 天、30 天和自然月汇总记录仅参与对应周期指标，不会伪造成每日趋势。

V2.1 的 `batchComparison` 只认 `status=completed` 且同平台、同账号的真实批次。响应提供当前/上期批次、指标差值、六类画像百分点变化、关注热词新增/消失/持续/排名升降、两次采集时间之间的作品汇总和规则 AI 摘要；不足两个批次时比较结果保持 `null` 并返回明确等待消息。

## 5. AI 内容策划 API

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/content-planning` | GET | 获取推荐 TOP5、方案、任务、作品和复盘 | 无 | 策划中心仪表盘 |
| `/api/content-planning` | POST | 按动作生成或推进闭环 | `action` 与对应 ID | 更新后的策划仪表盘 |

`POST` 动作：

| `action` | 必填字段 | 行为 |
|---|---|---|
| `generate_plan` | `hotTopicId` | 仅为抖音 A 级热点生成/更新方案 |
| `generate_task` | `planId`，可选 `dueDate` | 创建任务并关联内容方案 |
| `link_post` | `planId`、`postId` | 关联抖音作品并把任务推进到已发布 |
| `refresh_feedback` | 无 | 根据作品指标刷新内容方案复盘 |

方案中的标题、脚本、分镜、目标值由当前规则引擎生成，并非外部大模型响应。

## 6. 任务与营销运营 API

| 路径 | 方法 | 用途 | 主要输入 | 主要输出 |
|---|---|---|---|---|
| `/api/tasks` | GET | 查询任务看板和周报 | 无 | 八阶段任务、统计、负责人数据 |
| `/api/tasks` | POST | 创建任务 | 截止日、平台、名称、内容类型、来源、负责人、优先级 | 新任务 |
| `/api/tasks` | PATCH | 拖拽/操作后更新状态 | `id`、`status` | 更新任务及自动作品关联结果 |
| `/api/tasks` | PUT | 主动同步任务与作品 | 无 | 同步结果 |
| `/api/marketing-operations` | GET | 营销运营中心日常汇总 | 可选 `month=YYYY-MM` | 今日待办、运营日历、目标和 AI 每日简报 |

任务来源支持热点、AI 内容策划、人工和节日活动；发布后的自动关联逻辑依赖现有作品数据和同步规则。

## 7. 安全与稳定性要求

1. 生产环境必须启用外部 Agent/采集 API 密钥，不得依赖“未配置即放行”的开发行为。
2. 密钥只放在 Sites/Cloudflare 环境配置或本地忽略文件，不写入文档、代码或 Git 历史。
3. 所有写接口应记录来源、批次和错误；大批量写入使用 D1 batch，避免部分成功。
4. 外部 URL、标题和评论均视为不可信输入，展示时不得执行其中脚本。
5. 删除、覆盖和回滚操作需要二次确认并限制到明确批次或记录。
6. 对外 API 版本升级应保持旧契约兼容，或提供迁移期与版本前缀。

## 8. 后续 API 规范化建议

- 为所有核心路由补充 OpenAPI/JSON Schema，并把标准字段定义抽成可版本化契约。
- 将旧版 `/api/collections*`、兼容 `/api/hot-topic/import` 与统一 V2 主链标注生命周期。
- 为写接口统一鉴权、幂等键、请求 ID、错误码和审计字段。
- 为粉丝 V2 接口补充正式 JSON Schema，并在形成连续历史快照后增加跨批次画像对比合同测试。
- 增加 API 合同测试，覆盖日期时区、同日重复、跨平台关联和批次回滚。
