# 新媒体运营驾驶舱 V1.0

独山子大峡谷 AI 营销中台的新媒体运营中心页面，独立于 OTA 销售驾驶舱和 OTA 舆情监测中心。

## 页面

- `/`：平台运营总览、今日内容情况、爆款作品、热点趋势、模拟 AI 建议。
- `/content`：从 `social_posts` 读取作品，支持平台、日期和指标排序。
- `/tasks`：从 `content_tasks` 读取任务，支持新增任务和修改状态。
- `/imports`：上传 Excel 或数据截图，完成预览、确认、重新导入与批次回滚。
- `/hot-topics`：热点 CRUD、TOP10 排行、景区关联评分与规则型 AI 选题推荐。
- `/ai-analysis`：作品爆款评分、五维内容评分、平台分析、选题推荐与 AI 日报/周报。
- `/collector`：统一管理 Chrome 自动采集、Excel 人工导入、数据校验和采集日志；V1.0 仅开放抖音自动采集。
- `/comment-insights`：分析真实评论的情绪、关键词和游客需求，输出内容运营建议。

## 数据接口

- `GET /api/dashboard`：汇总 `social_accounts`、`social_posts`、`hot_topics`、`content_tasks`。
- `GET /api/posts`：查询和排序作品。
- `GET /api/tasks`：查询任务。
- `POST /api/tasks`：新增任务。
- `PATCH /api/tasks`：修改任务状态。
- `GET /api/imports`：查询导入记录。
- `POST /api/imports`：保存 Excel 或图片文件并创建导入记录。
- `PATCH /api/imports`：记录文件识别结果。
- `DELETE /api/imports`：删除指定批次写入的数据，保留导入日志。
- `POST /api/imports/confirm`：服务端复核并以事务方式写入作品，或人工确认图片。
- `GET /api/hot-topics`：查询热点、TOP10、关联分析和选题推荐。
- `POST /api/hot-topics`：新增热点并自动计算景区关联度。
- `PATCH /api/hot-topics`：编辑热点并重新计算关联度。
- `DELETE /api/hot-topics?id={id}`：删除指定热点，不触碰历史作品。
- `GET /api/ai-analysis`：读取作品、热点和账号数据，生成规则评分、平台洞察、选题及运营报告。
- `GET /api/collections`：查询采集日志及成功、失败汇总。
- `POST /api/collections`：校验抖音 Chrome 采集文件并创建待确认日志，不写作品表。
- `POST /api/collections/confirm`：再次校验、拦截重复作品并以事务方式写入 `social_posts`。
- `POST /api/collections/comments`：校验抖音评论采集文件并创建待确认日志，不写评论表。
- `POST /api/collections/comments/confirm`：再次校验、关联已有作品并以事务方式写入 `social_comments`。
- `DELETE /api/collections?id={id}`：回滚指定采集批次的作品，保留采集日志。
- `GET /api/comment-insights`：查询当前评论洞察结果。
- `POST /api/comment-insights`：运行规则模型，并将分析结果写回 `social_comments`。

前端只依赖这些版本化接口。未来接入平台自动采集时，可在服务端扩展数据写入流程，不需要重写页面。

## 数据导入中心 V1.0

Excel 支持以下字段名：`标题`、`平台`、`发布时间`、`播放量`、`点赞`、`评论`、`收藏`、`分享`、`涨粉`。支持中文平台名或内部平台编码。

导入采用“保存文件 → 本地识别 → 数据预览 → 服务端复核 → 事务写入”的流程。任何一行校验失败都会拒绝整批写入；成功作品记录 `import_log_id`，允许按批次安全回滚。原始上传文件存入独立对象存储，数据库通过 `data_import_logs` 保留导入历史。

图片导入当前只保存文件、创建记录并等待人工确认；OCR 接口已经预留，但 V1.0 不调用 OCR 服务。

## 热点监测中心 V1.0

`hot_topics` 在原有字段上增加 `keyword`、`status` 与 `created_at`，保留 `collect_time` 作为最近采集或编辑时间，确保驾驶舱已有查询兼容。关联度由服务端规则引擎根据热点关键词、景区名称和 `social_posts` 历史标题/标签计算；选题推荐返回标题、内容方向、适合平台和拍摄建议。

当前 `recommendationEngine` 为 `rules-v1`。接口响应预留 `/api/v1/social/ai/topic-recommendations` 作为未来大模型适配路径，但 V1.0 不调用外部模型，也不实现自动采集。

## AI 内容分析中心 V1.0

内容分析中心直接读取 `social_posts`、`hot_topics` 和 `social_accounts`，不新增永久模拟数据。综合评分满分 100 分，权重为：视觉吸引力 25%、标题质量 20%、互动能力 20%、传播能力 20%、热点匹配度 15%。爆款评分单独结合相对播放表现、互动率、分享率和涨粉计算。

V1.0 尚未识别视频画面，因此视觉吸引力使用相对播放、收藏率、内容类型等数据代理指标，并在页面明确说明。AI 日报采用过去 24 小时，AI 周报采用过去 7 天；报告包含账号表现、优秀作品、问题分析和行动建议。当前分析引擎为 `content-rules-v1`，预留 `/api/v1/social/ai/content-analysis` 作为未来大模型接口。

## 新媒体智能采集中心 V1.0

智能采集中心将四项能力汇总到 `/collector`：Chrome 自动采集、Excel 人工导入、统一数据校验和采集日志。两种采集方式最终均写入 `social_posts`：Excel 数据通过 `import_log_id` 追踪，Chrome 数据通过 `collection_log_id` 追踪。

抖音 Chrome 采集流程：

1. 在 `/collector` 下载 `douyin-collector-v1.zip`，解压后在 `chrome://extensions` 开启开发者模式并加载扩展目录。
2. 运营人员自行登录有权管理的抖音创作者账号，打开作品管理列表并加载需要采集的作品。
3. 点击扩展的“采集当前页面”，扩展读取当前页面已显示的作品卡片并导出标准 JSON。
4. 将 JSON 上传至 `/collector`。服务端校验平台、发布时间、指标、作品链接、内容类型和重复作品。
5. 预览无误后人工确认。系统使用事务整批写入 `social_posts`；任意错误均拒绝整批入库。

扩展不读取 Cookie、密码或浏览历史，不绕过登录、验证码、风控或平台限制，也不直接连接数据库。抖音页面结构变化后，需升级扩展中的页面适配器。快手、微博和视频号的自动采集仍为后续阶段，当前继续使用 Excel 人工导入。

### 抖音评论详情采集 V1.0

作品列表采集逻辑保持不变。运营人员可从作品卡片的评论入口进入评论详情，由扩展展开当前可见的回复并采集每个作品最多 50 条评论，字段包括用户名、评论内容、评论时间和评论点赞数。

评论数据继续执行“标准 JSON → 数据校验 → 页面预览 → 人工确认 → 事务写入”的审批流程。确认前不会写入 `social_comments`；确认时按作品链接关联已有 `social_posts`，作品不存在、字段错误或单作品超过 50 条都会拒绝整批写入。成功批次通过 `collection_log_id` 关联采集日志，`collection_logs.entity_type` 标识作品或评论批次，`comment_count` 记录实际评论入库数。删除评论采集批次时只回滚该批评论，保留日志，不影响对应作品。

生产数据库会初始化一个零指标的“独山子大峡谷景区抖音”运营账号作为作品归属，不加载演示作品、虚构粉丝量或其他平台测试数据。

## 游客评论洞察中心 V1.0

洞察中心读取 `social_comments` 和关联作品，使用 `comment-rules-v1` 规则模型识别正向、负向和中性情绪，提取热门关键词，并将游客需求归入旅游攻略、交通路线、价格咨询、项目体验、亲子需求、老人需求、服务评价和其他八类。分析结果持久化至 `sentiment`、`keyword`、`user_need` 和 `ai_analysis`，不覆盖评论原文。

页面展示评论总量、情绪比例、热门关键词、需求分布和逐条分析结果，并根据主要需求生成建议拍摄主题、标题方向和内容优化建议。预留 `/api/v1/social/ai/comment-insights` 作为未来大模型适配接口；V1.0 不调用外部模型，也不自动回复游客。

## 本地运行

要求 Node.js 22.13+ 和 pnpm。

```bash
cp dev.vars.example .dev.vars
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。`LOAD_TEST_DATA=true` 只会向本地数据库加载第二阶段定义的测试数据；页面本身没有永久模拟作品或任务。

## 验证

```bash
pnpm db:generate
pnpm build
pnpm test
pnpm lint
```

数据库 Schema 位于 `db/schema.ts`，生成的 D1 迁移位于 `drizzle/`。项目根目录的 PostgreSQL 迁移仍是正式中台数据库设计基线；该 D1 迁移用于本应用的本地预览和 Sites 运行环境。

## 当前边界

- Chrome 自动采集 V1.0 仅支持抖音当前作品管理页面；快手、微博、视频号和平台 API 自动采集尚未实现。
- 图片上传未接入复杂 OCR，仅保存记录和人工确认。
- 未实现自动发布、自动回复或无审批 AI 执行。
- 不访问、不修改 OTA 模块的页面、接口或数据库表。
- AI 运营建议为 V1.0 模拟结果，并在页面明确标注。
- AI 内容分析采用可解释规则模型，不进行画面识别，也不调用外部大模型。
- 游客评论洞察采用关键词与情绪词规则，结果用于运营辅助，不替代人工判断或自动回复。
