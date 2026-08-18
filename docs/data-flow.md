# 新媒体运营中心数据流

> 本文区分当前已运行链路与规划链路。实线表示代码中已有接收或业务处理，虚线表示尚未接入的未来能力。

## 1. 总流程

```mermaid
flowchart LR
  subgraph Sources["数据来源"]
    WB["WorkBuddy\n热点 JSON / Excel"]
    DY["抖音创作者中心\n粉丝 / 作品 / 评论"]
    MC["MediaCrawler\n内容 / 评论"]
    AR["Agent-Reach\n全网趋势 / 新闻验证"]
    MAN["人工 Excel / 图片"]
  end

  subgraph Intake["数据采集中心"]
    API["统一接收 API"]
    PREVIEW["标准化、校验、暂存、预览"]
    CONFIRM["人工确认"]
    LOG["采集日志"]
  end

  subgraph Storage["数据库 / 文件"]
    HOT["hot_topics\nhot_topic_analysis"]
    POST["social_posts\nsocial_comments"]
    FAN["social_fans\nfan_growth_records"]
    AUD["content_audience_analysis"]
    R2["R2 上传与档案"]
  end

  subgraph Insight["监测与分析"]
    HM["热点监测"]
    CM["内容监测"]
    FM["粉丝分析"]
    CI["评论洞察"]
  end

  subgraph Operation["运营闭环"]
    CP["AI 内容策划"]
    TM["任务管理"]
    PUB["作品发布 / 再采集"]
    REV["热点、内容、任务效果复盘"]
    ARC["热点档案"]
  end

  WB --> API
  DY --> PREVIEW
  MAN --> PREVIEW
  MC -. "规划" .-> API
  AR -. "规划" .-> API
  API --> PREVIEW --> CONFIRM
  PREVIEW --> LOG
  MAN --> R2
  CONFIRM --> HOT
  CONFIRM --> POST
  CONFIRM --> FAN
  CONFIRM --> AUD
  HOT --> HM
  POST --> CM
  FAN --> FM
  POST --> CI
  HM --> CP --> TM --> PUB
  PUB --> POST
  POST --> REV
  HOT --> REV
  TM --> REV
  REV --> ARC
  ARC --> R2
```

## 2. WorkBuddy 热点流

```mermaid
sequenceDiagram
  participant W as WorkBuddy
  participant R as receive API
  participant S as 暂存区
  participant U as 运营人员
  participant H as hot_topics
  participant A as hot_topic_analysis
  participant P as 热点监测页面

  W->>R: POST 热点 JSON
  R->>R: 映射 platform/topic_type/topic_name/ranking/heat_value/trend
  R->>S: 写 collection_logs + staging records
  R-->>U: 返回预览、错误与同日重复提示
  U->>R: confirmed=true + overwrite/skip
  R->>H: 事务写入或更新每日快照
  Note over H,A: HTML/分析导入不覆盖原始热点
  R->>A: 按 hot_topic_id 保存分析结果
  H->>P: 原始热点
  A->>P: 关联度、推荐、标题、拍摄方向
```

当前事实：

- 统一主链目标表是 `hot_topics`；`HOT_TOPIC_DATA` 是兼容的外部 Agent 原始/分析表。
- 同日同平台同来源重复数据在确认时要求显式选择覆盖或跳过。
- 热点分析独立存入 `hot_topic_analysis`，不会覆盖原始热点字段。

## 3. 抖音内容与粉丝流

```mermaid
flowchart TD
  CREATOR["抖音创作者中心"] --> PAYLOAD["V3 标准 JSON"]
  PAYLOAD --> CHECK["结构、日期、链接、非负数、百分比、每作品最多 50 条评论校验"]
  CHECK --> PRE["无落库预览与完整率摘要"]
  PRE --> HUMAN{"人工确认？"}
  HUMAN -- 否 --> STOP["停止，不写业务表"]
  HUMAN -- 是 --> TX["D1 批处理"]
  TX --> ACCT["social_accounts"]
  TX --> FANS["social_fans"]
  TX --> GROWTH["fan_growth_records"]
  TX --> POSTS["social_posts"]
  TX --> AUDIENCE["content_audience_analysis"]
  TX --> COMMENTS["social_comments"]
  TX --> LOGS["collection_logs"]
```

说明：主系统代码接收和验证采集结果，不保证在云端直接控制本机抖音 App。账号登录、平台权限和源数据取得属于采集执行环境责任。

## 4. 内容策划与任务闭环

```mermaid
stateDiagram-v2
  [*] --> 热点分析
  热点分析 --> A级热点: 规则评分
  A级热点 --> 内容方案: 生成标题/脚本/分镜/目标
  内容方案 --> 待策划任务: 一键生成任务
  待策划任务 --> 待拍摄
  待拍摄 --> 拍摄中
  拍摄中 --> 待剪辑
  待剪辑 --> 待审核
  待审核 --> 待发布
  待发布 --> 已发布
  已发布 --> 已复盘: 关联 social_posts 并刷新指标
  已复盘 --> 热点档案
```

任务看板支持拖拽变更八阶段状态。作品关联后，系统读取播放、点赞、评论、收藏和分享，刷新内容方案与热点推荐效果。

## 5. 日期与平台口径

- 业务页面通过统一日期范围工具处理今日、昨日、近一周、自然月和自定义范围。
- 内容、评论一般按作品 `publish_time` 过滤；热点按 `collect_time` / `collection_date` 过滤；粉丝增长按 `record_date` 过滤。
- 当前业务平台枚举为 `douyin`、`kuaishou`、`weibo`；页面显示为抖音、快手、微博。
- 时间字符串写入前应携带明确时区；日归档按 Asia/Shanghai 口径生成。

## 6. 失败与恢复路径

1. 接收格式错误：返回 4xx，不创建业务数据。
2. 字段校验失败：批次状态为 `validation_failed`，禁止确认。
3. 同日热点重复：确认前必须选择 `overwrite` 或 `skip`。
4. D1 批处理失败：返回错误，不保留部分业务写入；采集日志记录失败信息。
5. 外部采集缺字段：保留失败原因，不能用模拟值伪造正式数据。
6. 档案文件缺失：下载接口可按指定日期重新生成；仍无数据时返回 404。

## 7. 未来接入边界

MediaCrawler 和 Agent-Reach 应作为独立进程运行，只通过统一 API 提交标准数据；不要把第三方采集器依赖、Cookie 或登录态放进主 Web 应用。接入前需完成平台条款、账号授权、限频、隐私和数据留存评估。
