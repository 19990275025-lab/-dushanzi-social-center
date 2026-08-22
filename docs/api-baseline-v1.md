# 新媒体运营中心正式 API 基线 V1

> 锁定范围：`apps/social-media-center/app/api/**/route.ts`。
> V2.0 页面重组期间保留所有旧兼容接口，不删除、不改路径。

| API | 方法 | 基线职责 |
|---|---|---|
| `/api/ai-analysis` | GET | 规则型内容分析 |
| `/api/collections/comments` | POST | 评论采集预览 |
| `/api/collections/comments/confirm` | POST | 评论确认入库 |
| `/api/collections/confirm` | POST | 旧作品确认兼容入口 |
| `/api/collections/douyin-v2` | POST | 抖音 V2 兼容预览 |
| `/api/collections/douyin-v2/confirm` | POST | 抖音 V2 兼容确认 |
| `/api/collections/douyin-v3` | POST | 抖音 V3 预览 |
| `/api/collections/douyin-v3/confirm` | POST | 抖音 V3 确认 |
| `/api/collections/fans-v2` | POST | 抖音真实粉丝 V2 预览 |
| `/api/collections/fans-v2/confirm` | POST | 抖音真实粉丝 V2 入库 |
| `/api/collections/posts-daily-v2-2` | POST | WorkBuddy 每日作品 V2.2 预览 |
| `/api/collections/posts-daily-v2-2/confirm` | POST | WorkBuddy 每日作品 V2.2 入库 |
| `/api/collections/posts-deep-v2-1` | POST | WorkBuddy 深度作品 V2.1 预览 |
| `/api/collections/posts-deep-v2-1/confirm` | POST | WorkBuddy 深度作品 V2.1 入库 |
| `/api/collections/posts-v2` | POST | WorkBuddy 作品 V2 预览 |
| `/api/collections/posts-v2/confirm` | POST | WorkBuddy 作品 V2 入库 |
| `/api/collections` | GET / POST / DELETE | 旧采集日志、采集和批次删除兼容入口 |
| `/api/comment-insights` | GET / POST | 评论洞察查询与规则分析 |
| `/api/content-monitoring` | GET | 内容监测驾驶舱 |
| `/api/content-planning` | GET / POST | AI 内容策划主链 |
| `/api/dashboard` | GET | 运营驾驶舱聚合 |
| `/api/data-collection/v2/confirm` | POST | 统一采集确认入库 |
| `/api/data-collection/v2/logs` | GET | 统一采集日志 |
| `/api/data-collection/v2/preview` | GET | 统一采集预览 |
| `/api/data-collection/v2/receive` | GET / POST | 统一采集契约与接收 |
| `/api/hot-topic-analysis/import` | POST | 外部热点分析导入 |
| `/api/hot-topic-archive/download` | GET | 热点档案 Excel 下载 |
| `/api/hot-topic-archive` | GET / POST | 热点档案查询与生成 |
| `/api/hot-topic-data/analyze` | POST | 单热点规则分析 |
| `/api/hot-topic-data/generate` | POST | 热点选题生成入口 |
| `/api/hot-topic-data` | GET | 热点与最新分析查询 |
| `/api/hot-topic-feedback` | GET / PATCH / PUT | 热点效果复盘、关联作品与刷新 |
| `/api/hot-topic/import` | GET / POST | WorkBuddy 热点兼容导入 |
| `/api/hot-topics/douyin/confirm` | POST | 历史抖音热点测试确认 |
| `/api/hot-topics/douyin/preview` | GET | 历史抖音热点测试预览 |
| `/api/hot-topics` | GET / POST / PATCH / DELETE | 标准热点查询与维护 |
| `/api/imports/confirm` | POST | 人工导入确认 |
| `/api/imports` | GET / POST / PATCH / DELETE | Excel/图片导入与记录管理 |
| `/api/insights/content/detail` | GET | 单作品真实详情与评价证据 |
| `/api/insights/content` | GET | 内容分析汇总 |
| `/api/insights/fans` | GET | 粉丝分析与跨批次比较 |
| `/api/marketing-operations` | GET | 营销运营日常汇总 |
| `/api/posts` | GET | 作品查询 |
| `/api/tasks` | GET / POST / PATCH / PUT | 任务看板、创建、状态与作品同步 |
| `/api/workbuddy-relay` | GET / POST | WorkBuddy 热点自动接力状态与阶段控制 |

详细输入输出见 [API 设计与现状](api-design.md)。阶段1只允许新页面调用这些接口；如确需新增聚合接口，必须保持上述契约兼容。
