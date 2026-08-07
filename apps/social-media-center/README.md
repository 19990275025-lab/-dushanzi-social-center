# 新媒体运营驾驶舱 V1.0

独山子大峡谷 AI 营销中台的新媒体运营中心页面，独立于 OTA 销售驾驶舱和 OTA 舆情监测中心。

## 页面

- `/`：平台运营总览、今日内容情况、爆款作品、热点趋势、模拟 AI 建议。
- `/content`：从 `social_posts` 读取作品，支持平台、日期和指标排序。
- `/tasks`：从 `content_tasks` 读取任务，支持新增任务和修改状态。

## 数据接口

- `GET /api/dashboard`：汇总 `social_accounts`、`social_posts`、`hot_topics`、`content_tasks`。
- `GET /api/posts`：查询和排序作品。
- `GET /api/tasks`：查询任务。
- `POST /api/tasks`：新增任务。
- `PATCH /api/tasks`：修改任务状态。

前端只依赖这些版本化接口。未来接入平台自动采集时，可在服务端扩展数据写入流程，不需要重写页面。

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
- 未实现自动发布、自动回复或无审批 AI 执行。
- 不访问、不修改 OTA 模块的页面、接口或数据库表。
- AI 运营建议为 V1.0 模拟结果，并在页面明确标注。
