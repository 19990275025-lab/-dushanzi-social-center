# 阶段3A：生产发布与兼容迁移验证

验收日期：2026-08-26。范围严格为快手适配层、最小兼容迁移及两条已在本地验证的真实样本；未进入阶段3B。

## 发布结论

- 使用原正式 Sites：`https://dushanzi-social-center.pink-raven-4682.chatgpt.site`，未创建新站点。
- 适配实现提交：`2cdbde0d15a2f77212bf774839cce46033953b90`。
- 生产隔离核验修订：`ae1dda59f47e1ed5b414f69d0e9860aba4553396`。旧 `/api/insights/content` 在指定平台时，作品查询在 LIMIT 前过滤，汇总卡也仅返回该平台；路径与字段合同保留，抖音评分公式和采集规则不变。
- 首次生产迁移发布：Sites Version 99，部署 `appgdep_6a8edcf6ebe08191bb0639eaca134ce2`，2026-08-26 20:33:06（北京时间）成功。此后文档发布不增加业务迁移；最终 Sites 版本以本轮交付回执为准。
- 未修改页面、WorkBuddy、自动化、抖音V2.2、热点/粉丝采集、OTA、微博或视频号；第三方目录未纳入提交。

## 1. 生产备份

本轮在迁移前重新完成完整逻辑备份，未依赖较早备份替代：

- 开始：2026-08-26 20:23:39；完成：20:31:22（北京时间）。
- R2：`database-backups/kuaishou-adapter-v1/2026-08-26T12-23-39.054Z/manifest.json`。
- SHA-256：`1ec580fd8b05e12975b708efedbb3abee8e8170d842c6cc40999fc24ef537a10`。
- 34张表（33张业务表加迁移记录），137个Schema对象，35,228条记录，56,076,851字节。
- manifest与所有分块校验和及行数全部验证通过后才执行生产迁移。

恢复方式：按manifest及分块在隔离恢复库重建Schema、原始记录和索引，核验后经确认切换；先保存恢复时新增业务，不能直接用旧备份覆盖。此次未执行恢复演练或回滚。

## 2. Schema兼容迁移

应用 `0032_kuaishou_adapter_v1.sql`，没有新增永久业务表，生产仍为33张业务表。

| 表 | 实际生产调整 |
|---|---|
| social_post_traffic_sources | 新增metric_dimension，唯一键包含snapshot、指标维度、来源名称及流量性质 |
| social_post_metric_series | 新增source_platform |
| social_post_paid_traffic | 新增promotion_type、promotion_source、promotion_present |
| social_post_evaluations | 新增platform、model_version、promotion_status、promotion_type、natural_performance_confidence、viewing_score、follower_score |
| social_comments | 新增field_availability；作者、点赞、回复数允许NULL；兼容重建保留旧行、ID、索引和回复关系 |
| social_posts | 保留原字段；作品唯一身份为platform+account_id+platform_post_id，保留非快手标题冲突兼容 |

共13个新增字段、3项唯一索引调整。生产列清单已实际读取核验；迁移后、样本写入前，各业务表记录数与备份完全一致。

`metric_dimension`保存标准指标play/like/comment/completion/follow，`source_type`保留源JSON键（如complete_play_count、follower_gain），`source_name`保存发现页等渠道。两作品均为7来源×5指标，互不覆盖；来源计数不擅自换算百分比。

## 3. 仅两条真实样本

文件：`~/Desktop/新媒体内容监测/快手/kuaishou_daily_monitor_20260822.json`。
SHA-256：`344f9c3a60f1ddb27a5e806060d5088ded93075f235c208c30d4b33e7bfa58f0`。
实际采集时间：`2026-08-22T12:50:51+08:00`，没有冒充8月26日数据。

生产先预览，再依据本轮明确确认执行正式写入，日志ID为584。

| 来源分类 | 平台作品ID | 生产主表ID | 快照ID | 播放 | 点赞 | 实际评论 |
|---|---|---:|---:|---:|---:|---:|
| 新发现 | 3xnbhb99sxti6gy | 22 | 5 | 967 | 4 | 1 |
| 持续监测 | 3xffm3ri4q6966y | 23 | 6 | 4,017 | 16 | 2 |

“持续监测”为WorkBuddy来源分类，不代表生产数据库已有记录。生产此前没有快手主记录，因此首次新增2条、更新0条；不是同一作品重复建档。

| 表/记录 | 本批新增 | 生产入库后总数 |
|---|---:|---:|
| social_posts | 2 | 23 |
| social_post_snapshots | 2 | 6 |
| social_post_metric_series | 236 | 884 |
| social_post_traffic | 2 | 6 |
| social_post_traffic_sources | 70 | 93 |
| social_post_paid_traffic | 4 | 6 |
| social_comments | 3 | 65 |
| social_fans | 1 | 2 |
| social_post_evaluations | 2 | 2 |
| social_post_audience | 0 | 161 |
| social_post_comment_keywords | 0 | 106 |

快手粉丝快照341，日期8月22日；未生成画像或增长记录。两条V0.5评价均关联本次snapshot，置信度low，属于小样本初评，不是行业标准结论。

## 4. 数据真实性与推广保护

- 粉条独立2条状态记录：`paid / kuaishou_fentiao / promotion_present=0`，来自真实false，不代表有两条付费作品。
- 平台助推独立2条状态记录：`platform_support / kuaishou_platform_support / promotion_present=1`，启用不代表已贡献已知流量。
- 推广播放量均NULL；没有“总播放减投放”的人工推算。
- 快手评价仅使用平台中立字段与独立V0.5策略；旧 `douyin_paid_status` 为 `not_applicable` 兼容占位，不作为快手评价依据。抖音专属吸引力/效率列保持NULL。
- 14项unavailable、5项no_data原样保存；3条评论时间保持NULL；未生成观众画像、评论热词或粉丝画像。
- 真实平台返回的收藏/分享等0保留，缺失值不补0。没有模拟数据。
- 原始文件校验和前后相同，未修改原JSON。整份文件5条中只处理2条，文件状态为validated/partial，其余3条未写入；没有导入24条历史作品。

## 5. 抖音历史与双平台隔离

迁移前后、快手入库后，抖音原有字段按备份逐行核对，以下数量与原值均保留：

| 抖音原有数据 | 前后均为 |
|---|---:|
| 作品 | 21 |
| 快照 | 4 |
| 平台趋势 | 648 |
| 流量质量 | 4 |
| 来源 | 23 |
| DOU+记录 | 2 |
| 作品画像 | 161 |
| 评论热词 | 106 |
| 评论 | 62 |
| 回复 / 评价历史 | 0 / 0 |

这里记录实际生产基线，不把本地额外的抖音快照/评价同步上去。原抖音粉丝、增长、热点、档案、反馈、策划和任务未因本次写入改变。

生产实测：

- `/api/content-monitoring?platform=douyin` 的业务响应与发布前完全一致（排除响应生成时间）。
- `/api/insights/content?platform=douyin` 的原指标、作品、分析保持一致，仅去除其他平台汇总卡。
- 两个旧接口的 `platform=kuaishou` 分支以及 `/api/kuaishou-adapter/content` 均只返回2条快手作品。
- 抖音ID请求快手详情、快手ID请求抖音详情均返回404。
- 8月1—26日可读到样本；8月25—26日无作品时播放返回NULL而不是伪0，证明日期过滤实际生效。

### 并发日志说明

逐行审计发现唯一既有操作日志变化：`collection_logs.id=583`，原热点自动接力在**20:27:20（迁移发布前）**重复记录“没有找到当日WorkBuddy热点文件”。这是备份期间原后台任务的运行日志更新，不是本次快手迁移或入库修改；未回滚、删除该日志，也未改动热点流程。原始审计保留此差异，不宣称整个数据库所有字节均未变化。

除该已识别的并发操作日志外，29张带id表的35,193条历史记录逐行旧字段核验通过；策划及策划反馈两张非id主键表另行比较相同，维护记录及粉丝批次数量保持不变。

## 6. 防重复和测试

- 再次预览完全相同文件/选中作品：`already_processed`。
- 再次确认相同日志/checksum：`already_processed`。
- 重复前后29张表的实时记录数完全一致，作品、快照、趋势、来源、评论、粉丝快照、评价均没有再次写入。
- Build通过；Lint通过；完整Test 70/70通过，无跳过。测试使用真实文件与只读备份的隔离副本，不向业务库写模拟记录。
- 生产API核验通过，生产D1兼容字段/新增记录/历史数据核验通过。
- 本次业务数据丢失0、跨平台污染0、重复写入0。

原始数据、逻辑备份、凭据及本机核验JSON不提交Git。详细本机核验产物位于应用的 `outputs/production-3a-20260826.HGoS7K/`（Git忽略）。

## 7. 阶段3B边界

适配与两样本生产验收通过，允许在用户另行确认后进入3B；本轮停止，不执行全量入库、页面接入或自动化。

3B仍需核对历史文件的编码账号ID与本批数字账号ID，不能按名称自动合并；页面应消费快手平台评价合同，不复用抖音DOU+标签和30/25/25/20权重。当前快手页面容器未升级为全量运营页，这不是本轮发布失败。
