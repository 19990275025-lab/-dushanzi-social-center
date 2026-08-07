# 新媒体运营驾驶舱 V1.0

独山子大峡谷 AI 营销中台的新媒体运营中心页面，独立于 OTA 销售驾驶舱和 OTA 舆情监测中心。

## 页面

- `/`：平台运营总览、今日内容情况、爆款作品、热点趋势、模拟 AI 建议。
- `/content`：从 `social_posts` 读取作品，支持平台、日期和指标排序。
- `/tasks`：从 `content_tasks` 读取任务，支持新增任务和修改状态。
- `/imports`：上传 Excel 或数据截图，完成预览、确认、重新导入与批次回滚。
- `/hot-topics`：热点 CRUD、TOP10 排行、景区关联评分与规则型 AI 选题推荐。
- `/ai-analysis`：作品爆款评分、五维内容评分、平台分析、选题推荐与 AI 日报/周报。
- `/data-templates`：下载四个平台作品模板和竞品模板，并在入库前检查填写格式。

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
- `GET /api/data-templates`：查询模板清单、字段定义和校验规则。
- `POST /api/data-templates`：在内存中检查 Excel 表头、日期、数字、平台和内容类型，不保存文件、不写数据库。

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

## 数据资产采集模板中心 V1.0

模板中心提供抖音、快手、微博、视频号四份作品数据模板，以及一份竞品账号数据模板。每份 Excel 均包含 `数据采集`、`填写说明`、`填写示例` 三个工作表；实际导入时只填写和使用第一个工作表，不应修改字段名称或顺序。

真实数据采集流程：

1. 在 `/data-templates` 下载对应平台模板。
2. 人工查看平台作品页面，将公开指标、作品链接和采集备注填写到 `数据采集` 工作表。
3. 回到模板中心选择同一模板类型并上传文件，检查日期、数字、平台名称、必填字段和内容类型。
4. 校验通过后进入 `/imports`，执行预览、服务端复核和人工确认入库。

模板中心校验不会把文件写入数据库或对象存储。平台名称固定为 `抖音`、`快手`、`微博`、`视频号`；发布时间使用 Excel 日期或 `YYYY-MM-DD HH:mm:ss`；播放、点赞、评论、收藏、分享必须为非负整数，涨粉量允许负数。

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

- 未实现 Chrome、Playwright 或平台 API 自动采集。
- 图片上传未接入复杂 OCR，仅保存记录和人工确认。
- 未实现自动发布、自动回复或无审批 AI 执行。
- 不访问、不修改 OTA 模块的页面、接口或数据库表。
- AI 运营建议为 V1.0 模拟结果，并在页面明确标注。
- AI 内容分析采用可解释规则模型，不进行画面识别，也不调用外部大模型。
- 数据模板校验只检查格式，不替代数据导入中心的预览、确认和入库流程。
