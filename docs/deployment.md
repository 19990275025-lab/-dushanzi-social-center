# 新媒体运营中心开发与部署

> 当前应用目录：`apps/social-media-center`
> 技术栈：Next.js 16 + React 19 + Vinext/Vite + Cloudflare Worker/Sites + D1 + R2。
> 本文只提供安全的变量名和流程，不包含任何真实 Cookie、密码、Token、Webhook 密钥或数据库密码。

## 1. 环境要求

- Node.js `>= 22.13.0`
- pnpm（仓库存在 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`）
- 可访问对应 Cloudflare/Sites 项目的开发或部署权限
- 本地开发使用项目自带 Wrangler/Miniflare 依赖，不需要全局安装

## 2. 本地开发

```bash
cd apps/social-media-center
pnpm install --frozen-lockfile
pnpm dev
```

常用检查：

```bash
pnpm lint
pnpm build
pnpm test
```

说明：

- `pnpm test` 会先执行 Vinext 构建，再执行 `tests/rendered-html.test.mjs`。
- 本地 D1/R2 由 Cloudflare Vite 插件和 `.openai/hosting.json` 中的 binding 名称装配。
- `.wrangler/`、`dist/`、`outputs/`、`work/`、`.env*`、`.dev.vars` 已忽略，不应提交。
- 不要为文档或页面测试运行真实采集任务。

## 3. 环境变量与绑定

### 3.1 Cloudflare 绑定

| 名称 | 类型 | 用途 |
|---|---|---|
| `DB` | D1 binding | 新媒体运营中心业务数据库 |
| `UPLOADS` | R2 binding | 上传文件和热点 Excel 档案 |
| `ASSETS` | Worker binding | 静态资源 |
| `IMAGES` | Images binding | 图片优化 |

绑定名称必须与 `.openai/hosting.json`、Vite 配置和生产项目一致。D1 不通过传统数据库密码连接，仍需依靠 Cloudflare 项目权限保护。

### 3.2 应用密钥

| 变量 | 必需场景 | 说明 |
|---|---|---|
| `EXTERNAL_AGENT_API_KEY` | 外部 Agent/统一采集接口 | 服务端鉴权密钥；生产必须配置 |
| `WORKBUDDY_HOT_TOPIC_DIR` | 本地导入脚本 | WorkBuddy 热点目录；只在本机配置 |
| `WORKBUDDY_API_BASE_URL` | 本地导入脚本 | 目标站点/API 地址 |
| `WORKBUDDY_AGENT_KEY` | 本地导入脚本 | 调用采集接口的密钥 |
| `WORKBUDDY_SITES_BEARER_TOKEN` | 受保护 Sites 调用 | 可选的 Sites 授权令牌 |

示例文件只能写占位符：

```dotenv
EXTERNAL_AGENT_API_KEY=replace-with-secret
WORKBUDDY_API_BASE_URL=https://example.invalid
WORKBUDDY_HOT_TOPIC_DIR=/absolute/path/to/hot_topics
```

不得提交：

- 抖音、快手、微博 Cookie 或登录态。
- GitHub、Cloudflare、Sites、WorkBuddy 的真实 Token。
- Webhook 签名密钥、API 密钥或任何个人账号密码。
- 从浏览器导出的用户数据、会话文件或带隐私的原始评论备份。

## 4. 数据库

### 4.1 结构来源

- Drizzle 定义：`apps/social-media-center/db/schema.ts`
- 运行时兼容初始化：`apps/social-media-center/db/bootstrap.ts`
- 迁移配置：`apps/social-media-center/drizzle.config.ts` 与 `drizzle/`

生成迁移：

```bash
pnpm db:generate
```

仅生成迁移不等于可直接部署。每次数据库调整应：

1. 备份生产 D1。
2. 在隔离环境验证迁移和回滚。
3. 检查外键、唯一索引、默认值与历史数据兼容性。
4. 更新 `docs/database-design.md` 与 `CHANGELOG.md`。
5. 在维护窗口执行并验证核心页面。

本次文档规范化没有修改 schema 或执行迁移。

## 5. R2 文件

R2 `UPLOADS` 当前保存：

- Excel/图片导入文件或记录所需对象。
- `YYYY-MM-DD_新媒体热点分析报告.xlsx` 热点档案。

生产环境需要定义：对象保留周期、访问权限、备份策略和含个人信息文件的删除流程。公开下载必须经过应用接口，避免把桶设置为全量公开。

## 6. 生产构建与 Sites 发布

构建检查：

```bash
cd apps/social-media-center
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

当前项目使用 Sites 构建插件和 `.openai/hosting.json`。发布应通过团队已有的 Sites 发布流程执行，并确认：

1. 目标项目是新媒体运营中心，不是 OTA 系统。
2. `DB`、`UPLOADS`、`ASSETS`、`IMAGES` 绑定正确。
3. 生产密钥在平台环境配置中存在，仓库中不存在。
4. 数据库迁移（若有）先于依赖新字段的应用版本完成。
5. 发布后验证首页、热点、内容、粉丝、采集预览和任务页面。
6. 检查 Worker 定时任务最近执行结果。

### 定时任务

当前 Cron：`30 0 * * *`（UTC），代码按北京时间日期处理，预期约北京时间 08:30 执行：

- 生成并存储每日热点档案。
- 刷新内容方案反馈。
- 同步任务与已发布作品关联。

修改 Cron 前必须确认 UTC/北京时间转换和夏令时假设（中国不使用夏令时）。

## 7. GitHub 发布流程

```bash
git status --short
git pull --ff-only origin main
git log --oneline --decorate -10
```

开发建议通过功能分支和 Pull Request；紧急直接推送主分支也必须在明确授权、检查通过、无无关文件的前提下执行。发布前：

1. 只暂存本次范围文件，避免把本地采集工具、数据文件或秘密一并提交。
2. 使用模块化提交：`feat(social)`、`fix(social)`、`docs(social)`。
3. 更新 CHANGELOG 和版本文档。
4. 推送后确认本地与 `origin/main` 同步。
5. V1.0 验收通过后再创建 `social-v1.0.0` tag 和 GitHub Release。

禁止使用 `--force` 覆盖共享主分支或已发布 tag。

## 8. 发布后验证

| 检查项 | 验证方式 |
|---|---|
| 页面可用 | 首页、内容、粉丝、热点、策划、任务返回 2xx 且能加载数据 |
| D1 | 查询/写入测试批次成功，无 schema 错误 |
| R2 | 导入上传和热点档案下载正常 |
| 日期 | 今日/昨日/近一周/自然月/自定义范围符合北京时间 |
| 采集安全 | 接收后只进入暂存；未确认不写业务表 |
| 任务闭环 | 方案可生成任务，发布作品可关联并刷新反馈 |
| 日志 | `collection_logs` 有数量、状态和失败原因 |
| 定时任务 | 每日档案、反馈刷新和作品关联按预期执行 |

## 9. 回滚

### 应用回滚

1. 记录当前失败部署和最后一个健康 Git commit。
2. 通过 Sites/Cloudflare 的已有部署历史回退到健康构建，或从健康 commit 重新发布。
3. 不重写 Git 历史，不强制推送。

### 数据回滚

- 没有数据库变更：只回退应用，不触碰 D1。
- 有数据库迁移：按该版本独立验证过的回滚脚本执行，先备份。
- 采集批次问题：优先按明确 `collection_log_id` 处理，禁止按宽泛日期无确认删除。
- R2 文件问题：恢复对象版本或重新生成档案，不覆盖无关日期。

## 10. 故障排查顺序

1. 确认站点版本、Git commit 和部署时间。
2. 检查绑定是否存在，不在日志中打印密钥。
3. 查看 `collection_logs` 状态、数量与错误摘要。
4. 对照业务时间字段：作品 `publish_time`、热点 `collection_date`、粉丝 `record_date`。
5. 检查平台代码映射与账号/作品外键关联。
6. 在隔离环境复现后再修复生产，禁止用模拟数据掩盖空数据问题。
