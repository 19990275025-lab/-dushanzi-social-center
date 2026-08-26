# 阶段3A：快手平台数据适配层 V1.0

核验日期：2026-08-26。范围：真实文件映射、兼容迁移、平台策略、两条样本验证；不开发页面、不采集、不增加调度。

## 1. 当前结论与发布边界

本地适配、D1 迁移、两条真实样本入库、重复拦截、双平台 API 和事务失败保护均已验证。正式站点是公开站点，**本次适配层的生产迁移、样本入库与发布仍需发布确认**，不能把本地结果当作已上线。迁移前生产完整逻辑备份已完成；正式执行时须复核备份后是否又有业务写入。

未修改页面、WorkBuddy、自动接力规则、抖音评价公式、粉丝采集、热点流程或 OTA；未导入24条历史作品。原始 JSON、数据库备份及测试输出不提交 Git。`Agent-Reach/`、`MediaCrawler/` 不在本次提交范围。

## 2. 真实文件与样本范围

- 文件：`~/Desktop/新媒体内容监测/快手/kuaishou_daily_monitor_20260822.json`。
- 平台声明：`kuaishou`；真实性声明：`real_data_only_no_estimation`。
- 原始采集时间：`2026-08-22T12:50:51+08:00`。不是8月26日数据。
- SHA-256：`344f9c3a60f1ddb27a5e806060d5088ded93075f235c208c30d4b33e7bfa58f0`。
- 文件共5条作品（1条新发现、4条持续监测），本次只选择以下2条。

| 来源分类 | platform_post_id | 发布时间 | 真实播放 | 真实点赞 |
|---|---|---|---:|---:|
| 新发现作品 | `3xnbhb99sxti6gy` | 2026-08-21 16:29:55 +08:00 | 967 | 4 |
| 持续监测作品 | `3xffm3ri4q6966y` | 2026-08-16 18:09:25 +08:00 | 4,017 | 16 |

“持续监测”是 WorkBuddy 来源分类，不表示系统已有主记录。导入前本地和生产均无快手作品，故本地本次新增主记录2条、更新0条。另在内存数据库中预置同一真实作品，验证复采只新增快照、不新建第二条主记录。

## 3. 真实字段映射

| WorkBuddy 字段 | 目标 | 口径与缺失保护 |
|---|---|---|
| `post.post_id` | `social_posts.platform_post_id` | 字符串；联合平台、账号识别 |
| `account.user_id/account_name` | `social_accounts` | 保留原身份，不按名称猜测合并 |
| `post.title/publish_time/type/status/detail_url` | 作品主表同义字段 | 原状态也保留在 `content_metadata` |
| `post.duration_ms` | `duration_seconds` | 毫秒÷1000；缺失保持 NULL |
| `basic_metrics` | `social_post_snapshots` | 播放、赞、评、藏、分享、作品涨粉；原始 JSON 同存 |
| `comments.total_visible` / `comments.list.length` | `actual_loaded_count` / `comment_rows_count` | 与累计 `comment_overview_count` 分开 |
| `content_quality` | `social_post_traffic` | 完整播放率、平均播放秒数、2秒跳出、5秒完播、封面点击 |
| `traffic_trend` | `social_post_metric_series` | `play_hourly/play_daily/like_daily`，保留原时间与更新窗口 |
| `viewing_analysis.raw_data[].detailList` | 趋势表 | type1→`retention_second`；type2→`like_second` |
| `traffic_source.*` | `social_post_traffic_sources` | 按指标维度分别保存计数，不擅自换算占比 |
| `paid_traffic` | `social_post_paid_traffic` | 粉条是否存在、原始字段；量级未知时 NULL |
| `platform_support_traffic` | 同一兼容表中的独立记录 | 平台助推与付费推广分开；启用不等于已贡献流量 |
| `comments.list` | `social_comments` | 评论ID、作者、内容、时间、赞数、回复数；缺失字段显式 NULL |
| `account.fans_count_at_collection` | `social_fans` | 本次341；只保存账号总量快照，不生成画像/每日新增流失 |
| `diagnosis/metadata` | `content_metadata`、原始快照 | 平台官方诊断与模型评价分开，教程示例不当作自有内容 |

`hotDetailList` 是平台对标曲线：只保留在原始 JSON，不计入本作品趋势。作品观众画像、评论热词、情绪不写伪记录，也不参与快手评分。

本次样本共有14个 unavailable 能力状态（每作品7项）、5个 no_data 状态；另外3条评论发布时间均 NULL。这不是19条采集失败。0只用于平台真实返回的0，例如收藏、分享、完整播放率和作品涨粉。

## 4. 兼容 Schema

正式定义：`apps/social-media-center/db/schema.ts`。
迁移：`drizzle/0032_kuaishou_adapter_v1.sql`；使用 Drizzle 生成后审阅，改成 D1 外键安全、保留数据的迁移。
运行时兼容入口：`db/kuaishou-adapter-schema.ts`，与迁移 SQL 有一致性测试。

| 表 | 增量调整 |
|---|---|
| `social_post_traffic_sources` | 增加 `metric_dimension`，默认 unknown；保留原 `source_type` |
| `social_post_metric_series` | 增加 `source_platform`，历史值按作品主表真实平台补齐 |
| `social_post_paid_traffic` | 增加 `promotion_type/promotion_source/promotion_present` |
| `social_post_evaluations` | 增加 `platform/model_version/promotion_status/promotion_type/natural_performance_confidence/viewing_score/follower_score` |
| `social_comments` | 增加 `field_availability`；作者、点赞数、回复数允许 NULL；其余旧字段与默认值保留 |
| `social_posts` | 不增字段；明确平台+账号+作品ID唯一性 |

未增加独立快手业务表，共新增13列；评论表为取消旧非空约束执行兼容重建，旧评论、回复、ID、自增序列与索引在同一事务中保留。没有业务清空操作。

### 唯一键

- 作品：`(platform, account_id, platform_post_id)`。
- 流量来源：`(snapshot_id, metric_dimension, source_name, traffic_nature)`。`snapshot_id → post_id → platform + account_id` 已包含上游身份，不重复存平台列。
- `metric_dimension` 支持 play/like/comment/favorite/share/completion/follow/other/unknown；本次真实出现 play、like、comment、completion、follow。
- 同名“发现页”五个维度可以同时存在，不互相覆盖。
- 旧抖音明确页面流量且有数值/占比的来源补 play，无法确认者保留 unknown，原 `source_type` 不改。
- 旧“账号+标题”去重在非快手平台继续生效；只有带真实快手作品ID的记录不受标题重复限制。旧导入接口只更新对应冲突索引谓词，保留抖音既有按标题匹配行为。

### 推广字段

| 语义 | promotion_type | promotion_source |
|---|---|---|
| 抖音 DOU+ | paid | dou_plus |
| 快手粉条 | paid | kuaishou_fentiao |
| 快手平台助推 | platform_support | kuaishou_platform_support |

本次两作品粉条 `promotion_present=0` 来自原始 false；平台助推 `promotion_present=1` 来自原始 true，`enable_boost=true` 留在原始字段。推广播放、费用、自然播放均未被推算。**推广表有记录不等于付费作品**，快手读取必须判断类型与存在状态。

## 5. 平台独立评价 V0.5

`lib/platform-evaluation-strategies.ts` 分发 `DouyinEvaluationStrategy / KuaishouEvaluationStrategy`。抖音仍调用原评价函数，公式不变；快手不使用抖音30/25/25/20，也不使用 `douyin_paid_status` 作判断。

快手4项均采用0—100标度，综合分是可用维度等权平均：

1. 传播表现：同账号样本的累计触达、最近6个完整小时播放、精选/发现来源、分享率；粉条存在时不使用总播放评判自然能力。
2. 互动表现：同次快照的赞+评+藏+分享÷播放，以及各单项率；分母/分子缺失则不算。
3. 观看质量：平台完整播放、5秒完播、2秒跳出互补率、平均观看秒数/真实时长、封面点击率；非视频不适用。
4. 涨粉表现：作品真实涨粉及同次播放转粉率；不把账号粉丝变化当作作品归因。

相对表现采用同账号真实样本百分位（并列取中位）；不足2个可比较样本该相对指标为 NULL。真实全零指标可评价为0，但缺失不是0。分项置信度按可用指标数计算，历史样本少于10条或完整度低于80%时总置信度 low。

本次每项评分都属于“两条不同作品年龄样本的初步比较”，不能解释为行业绝对水平。V0.5 不授予自然爆款 S 级；平台助推量未知，自然表现置信度 low。不把作品画像、关键词、情绪或平台示例曲线放进评分。

保存评分日期、snapshot_id、模型版本、四项分数和完整证据。旧抖音列保留，快手 `douyin_paid_status=not_applicable` 仅满足历史兼容；快手观看/涨粉分数进入新字段，旧用户吸引/效率列为 NULL。

## 6. 接口与处理记录

| 方法/路径 | 用途 |
|---|---|
| POST `/api/collections/kuaishou-v1` | 接收 `rawText/sourceFile/sourcePath/selectedPostIds`，校验并保存预览 |
| POST `/api/collections/kuaishou-v1/confirm` | `confirmed=true + logId + checksum`，确认两个样本，事务入库 |
| GET `/api/kuaishou-adapter/content` | 快手专用只读合同；日期筛选，或 `id` 查询详情；附账号粉丝快照 |
| GET `/api/content-monitoring?platform=kuaishou` | 快手独立策略分支；不调用抖音模型 |
| GET `/api/insights/content?platform=kuaishou` | 同上；旧抖音请求保留原路径/输出 |
| GET `/api/insights/content/detail?id=...` | 先确认作品平台，再走各自读取；平台参数与身份不符返回404 |

写入接口要求秘密环境变量 `KUAISHOU_ADAPTER_KEY` 和请求头 `x-kuaishou-adapter-key`，未配置时拒绝写入。密钥不在源码、文档或原始 JSON 中。原站点公开，生产启用该接口需明确发布确认。

人工命令：`scripts/import-workbuddy-kuaishou-sample.mjs --posts=新作品ID,持续监测作品ID --file=kuaishou_daily_monitor_20260822.json`。默认只预览，加 `--confirm` 才确认；必须显式指定服务地址及密钥，没有默认生产目标，不自动调度。

防重复：原文件checksum+所选作品ID集合生成 `collection_logs.batch_key`；同一已完成样本返回 `already_processed`。作品、快照、趋势、评论、粉丝快照分别受唯一键保护。同一快照若已有不同原始内容，停止处理，不覆盖历史。

本次只处理2/5，所以文件整体仍为 validated/partial，已完成的是样本日志，不把整份文件误标 completed；余下3条原文件不变。正式表写入和日志 completed 同一事务，任一明细失败整批回滚，只留下失败日志。

## 7. 备份、数据保护与恢复

本地完整 SQLite 备份：`apps/social-media-center/outputs/kuaishou-pre-adapter-20260826.nm48ul/local-d1.sqlite`；`integrity_check=ok`。
SHA-256：`0d3a0b676a3624a963d64ddd95b543cb1a156ee6aeb07dc8de70d58e0e66aeb2`。

生产备份（北京时间2026-08-26 18:18:28开始、18:28:48完成）：R2完整逻辑备份，34张表（含迁移记录）、137个Schema对象、56,076,851字节；manifest及全部分页SHA-256均复核通过。

- R2 key：`database-backups/kuaishou-adapter-v1/2026-08-26T10-18-28.067Z/manifest.json`。
- manifest SHA-256：`43e27b7ebc22982dc2d6518fa83aaf04877c5ca691a57ddeee00e201e2a1f953`。
- 受密钥保护的备份接口不调用业务 bootstrap，不触发采集或 AI 分析；新增逐行旧字段核对能力供正式迁移后审计。

恢复必须先停止相关写入并另存恢复时的新数据。本地从完整副本恢复；生产按manifest schema和各表分页恢复到隔离恢复库，验证校验和、记录数量与外键后，经确认再切换。不得直接用旧备份覆盖后续新增数据。没有在本次执行恢复。

注意：迁移后的冲突索引与旧代码存在SQL契约，回滚不能只部署完全未适配的旧写入代码；应保留本次索引兼容修订，或执行经审批的数据库恢复。

本地原始数据与生产数据本来就不同：本地30作品/17快照/7评价，生产21作品/4快照/0评价。本任务不借机同步抖音历史或补算评价。

## 8. 验证结果

| 本地本批新增 | 数量 |
|---|---:|
| 作品主记录 | 2 |
| 作品快照 | 2 |
| 流量质量 | 2 |
| 真实趋势点 | 236 |
| 分指标流量来源 | 70 |
| 推广状态记录 | 4（粉条2、助推2） |
| 真实评论 | 3 |
| 粉丝快照 | 1（341粉丝） |
| 评价历史 | 2 |
| 作品画像/评论热词/粉丝画像/粉丝增长记录 | 0 |

趋势细分：小时播放160、每日播放7、每日点赞7、逐秒留存13、逐秒点赞49。来源细分：7个来源×5个真实指标×2作品。

本地原有冻结表按原始列逐行比较：作品30、快照17、趋势3665、流量17、来源109、推广5、作品画像508、热词322、评论128、回复13、评价7，全部原值保留；粉丝/增长/画像、热点/分析、策划/任务也未变化。外键检查为空，数据丢失0。

真实 HTTP 检查：快手两种内容接口均返回2条快手作品；抖音接口无快手混入；跨平台详情返回404；无密钥401；未确认409；空日期范围的播放为NULL。再次运行同一文件返回 `already_processed`，没有新增任何业务行。

可复核测试：`apps/social-media-center/tests/kuaishou-adapter.test.mjs`。使用真实JSON和只读基线副本构建一次性内存库；不造第二批数据，不向业务库写测试假值。覆盖迁移、NULL、复采复用主记录、双平台同ID、5维同来源、推广分离、原子失败回滚和防重复。

`pnpm test` 包含构建及全部回归：69/69通过（无跳过）；Build通过。Lint通过；检查生成的临时类型文件已移除。额外全量 `tsc --noEmit` 仍有13条原粉丝页面类型问题，该页面未修改，本次不扩展处理范围。

其他机器若没有真实JSON/只读备份，真实数据测试会明确标为跳过，不会使用模拟文件替代；验收必须提供 `KUAISHOU_REAL_FILE` 和 `KUAISHOU_BASELINE_DB` 后运行。

## 9. 阶段3B入口条件

结构层本地验证通过。正式生产链路仍须完成：公开站点发布确认→备份新鲜度复核→兼容迁移→同样两条样本→旧数据逐行核对→双平台线上接口验证。通过后再开展全量真实数据入库与页面接入。

3B还须核对：8月21日旧文件的编码账号ID与8月22日数字账号ID是否为同一真实账户，不能仅按名字合并；补齐旧快手页面对新 `platformEvaluation` 的展示合同，不能直接复用抖音 DOU+ 标签和四维分值；来源计数与累计指标时间窗不同，不做相减或自然传播归因。

原始目录没有HTML、文件没有作品画像或评论情绪，不是适配器故障。本次数据质量检查保留真实状态、排除平台示例，评分只可作低置信度初评，不建议据此宣布快手运营效果已稳定。
