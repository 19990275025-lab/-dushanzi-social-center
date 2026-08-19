"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import type { CollectionPayload, CollectionValidationError } from "@/lib/collections";
import type { CommentCollectionPayload } from "@/lib/comment-collections";
import type { DouyinCollectionV2Payload } from "@/lib/douyin-collection-v2";
import { formatCompact, formatDateTime } from "@/lib/format";
import { DataImportPanel } from "@/app/imports/page";

type CollectionLog = {
  id: number;
  platform: string;
  source_type: string;
  source_name: string;
  source_url: string | null;
  entity_type: "post" | "comment" | "douyin_v2" | "workbuddy_relay";
  status: string;
  total_count: number;
  success_count: number;
  error_count: number;
  comment_count: number;
  error_message: string | null;
  collected_at: string | null;
  created_at: string;
};

type Summary = {
  total_logs: number;
  imported_posts: number;
  imported_comments: number;
  validation_errors: number;
  latest_collection: string | null;
};

type WorkBuddyRelayRun = {
  relayLogId: number;
  status: string;
  fileName: string | null;
  fileDate: string | null;
  stage: string | null;
  originalCount: number;
  standardizedCount: number;
  importedCount: number;
  analysisCount: number;
  gradeACount: number;
  archiveGenerated: boolean;
  archiveFileName: string | null;
  contentPlanningUpdated: boolean;
  failedReason: string | null;
  updatedAt: string;
};

type WorkBuddyRelayStatus = {
  today: string;
  todayStatus: WorkBuddyRelayRun | null;
  latestSuccess: WorkBuddyRelayRun | null;
};

const statusNames: Record<string, string> = {
  pending: "待确认",
  completed: "已入库",
  failed: "校验失败",
  deleted: "已回滚",
  processing: "处理中",
  success: "接力成功",
  validation_failed: "校验失败",
  pending_confirmation: "待确认",
};

export default function CollectorPage() {
  const [activeTab, setActiveTab] = useState<"automatic" | "import">("automatic");
  const [payload, setPayload] = useState<CollectionPayload | null>(null);
  const [commentPayload, setCommentPayload] = useState<CommentCollectionPayload | null>(null);
  const [v2Payload, setV2Payload] = useState<DouyinCollectionV2Payload | null>(null);
  const [v2Summary, setV2Summary] = useState<{ fanSnapshots: number; fanGrowthRecords: number; posts: number; comments: number; completePosts: number; failures: number; successRate: number; completeness: { fans: number; posts: number; comments: number; overall: number; threshold: number }; eligibleForConfirmation: boolean; failedFields: string[] } | null>(null);
  const [logId, setLogId] = useState<number | null>(null);
  const [commentLogId, setCommentLogId] = useState<number | null>(null);
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [relayStatus, setRelayStatus] = useState<WorkBuddyRelayStatus | null>(null);
  const [errors, setErrors] = useState<CollectionValidationError[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadLogs = useCallback(() => {
    fetch("/api/collections")
      .then((response) => response.json() as Promise<{ logs: CollectionLog[]; summary: Summary }>)
      .then((result) => {
        setLogs(result.logs);
        setSummary(result.summary);
      });
    fetch("/api/workbuddy-relay")
      .then((response) => response.json() as Promise<WorkBuddyRelayStatus>)
      .then(setRelayStatus)
      .catch(() => setRelayStatus(null));
  }, []);

  useEffect(loadLogs, [loadLogs]);

  function resetPreview() {
    setPayload(null);
    setLogId(null);
    setErrors([]);
    setMessage(null);
  }

  function resetCommentPreview() {
    setCommentPayload(null);
    setCommentLogId(null);
    setErrors([]);
    setMessage(null);
  }

  function resetV2Preview() {
    setV2Payload(null);
    setV2Summary(null);
    setErrors([]);
    setMessage(null);
  }

  async function uploadV2Collection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetV2Preview();
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "仅支持 5MB 以内的抖音 V2.1 JSON 文件。" });
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/collections/douyin-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await file.text(),
      });
      const result = (await response.json()) as {
        error?: string;
        errors?: CollectionValidationError[];
        payload?: DouyinCollectionV2Payload;
        summary?: typeof v2Summary;
      };
      setErrors(result.errors ?? []);
      if (!response.ok || !result.payload || !result.summary) {
        setMessage({ type: "error", text: result.error ?? "V2.1 采集数据校验失败" });
      } else {
        setV2Payload(result.payload);
        setV2Summary(result.summary);
        setMessage({ type: "success", text: "V2.1 无落库预览已生成；数据库写入为 0 条。" });
      }
    } catch {
      setMessage({ type: "error", text: "V2.1 JSON 文件无法解析。" });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function confirmV2Collection() {
    if (!v2Payload || !v2Summary?.eligibleForConfirmation) return;
    if (!window.confirm(`确认写入粉丝画像、${v2Payload.posts.length} 条作品及其评论？`)) return;
    setBusy(true);
    const response = await fetch("/api/collections/douyin-v2/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: v2Payload }),
    });
    const result = (await response.json()) as { message?: string; error?: string; errors?: CollectionValidationError[] };
    setBusy(false);
    setErrors(result.errors ?? []);
    if (!response.ok) {
      setMessage({ type: "error", text: result.error ?? "V2.1 数据入库失败" });
    } else {
      setMessage({ type: "success", text: result.message ?? "V2.1 数据已入库" });
      setV2Payload(null);
      setV2Summary(null);
    }
    loadLogs();
  }

  const activeProgress = commentPayload?.progress ?? payload?.progress;
  const activeRange = commentPayload?.collectionRange ?? payload?.collectionRange;
  const activeFailures = commentPayload?.failures ?? payload?.failures ?? [];

  async function uploadCollection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetPreview();
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "仅支持 2MB 以内的 Chrome 采集 JSON 文件。" });
      event.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const content = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content),
      });
      const result = (await response.json()) as {
        error?: string;
        errors?: CollectionValidationError[];
        payload?: CollectionPayload;
        log?: CollectionLog;
      };
      setErrors(result.errors ?? []);
      if (!response.ok || !result.payload || !result.log) {
        setMessage({ type: "error", text: result.error ?? "采集数据校验失败" });
      } else {
        setPayload(result.payload);
        setLogId(result.log.id);
        setMessage({
          type: "success",
          text: `已识别 ${result.payload.rows.length} 条抖音作品，确认后统一写入 social_posts。`,
        });
      }
      loadLogs();
    } catch {
      setMessage({ type: "error", text: "JSON 文件无法解析，请重新通过 Chrome 采集器导出。" });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function confirmCollection() {
    if (!payload || !logId) return;
    setBusy(true);
    const response = await fetch("/api/collections/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logId, payload }),
    });
    const result = (await response.json()) as {
      message?: string;
      error?: string;
      errors?: CollectionValidationError[];
    };
    setBusy(false);
    setErrors(result.errors ?? []);
    if (!response.ok) {
      setMessage({ type: "error", text: result.error ?? "采集数据入库失败" });
      loadLogs();
      return;
    }
    setMessage({ type: "success", text: result.message ?? "采集数据已入库" });
    setPayload(null);
    setLogId(null);
    loadLogs();
  }

  async function uploadCommentCollection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetCommentPreview();
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "仅支持 2MB 以内的抖音评论 JSON 文件。" });
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const content = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/collections/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content),
      });
      const result = (await response.json()) as { error?: string; errors?: CollectionValidationError[]; payload?: CommentCollectionPayload; log?: CollectionLog };
      setErrors(result.errors ?? []);
      if (!response.ok || !result.payload || !result.log) {
        setMessage({ type: "error", text: result.error ?? "评论采集数据校验失败" });
      } else {
        setCommentPayload(result.payload);
        setCommentLogId(result.log.id);
        setMessage({ type: "success", text: `已识别 ${result.payload.rows.length} 条抖音评论，确认后写入 social_comments。` });
      }
      loadLogs();
    } catch {
      setMessage({ type: "error", text: "评论 JSON 文件无法解析，请重新采集。" });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function confirmCommentCollection() {
    if (!commentPayload || !commentLogId) return;
    setBusy(true);
    const response = await fetch("/api/collections/comments/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logId: commentLogId, payload: commentPayload }),
    });
    const result = (await response.json()) as { message?: string; error?: string; errors?: CollectionValidationError[] };
    setBusy(false);
    setErrors(result.errors ?? []);
    if (!response.ok) {
      setMessage({ type: "error", text: result.error ?? "评论采集数据入库失败" });
      loadLogs();
      return;
    }
    setMessage({ type: "success", text: result.message ?? "评论采集数据已入库" });
    setCommentPayload(null);
    setCommentLogId(null);
    loadLogs();
  }

  async function rollbackCollection(id: number, entityType: "post" | "comment" | "douyin_v2" | "workbuddy_relay") {
    const label = entityType === "douyin_v2" ? "粉丝、作品、观众和评论数据" : entityType === "comment" ? "评论" : "作品";
    if (!window.confirm(`确认回滚该采集批次写入的${label}？采集日志仍会保留。`)) return;
    const response = await fetch(`/api/collections?id=${id}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? { type: "success", text: "采集批次已回滚，日志继续保留。" }
        : { type: "error", text: result.error ?? "回滚失败" },
    );
    loadLogs();
  }

  return (
    <div className="page-stack collector-page">
      <header className="page-heading compact-heading">
        <div>
          <p className="eyebrow">DOUYIN INTELLIGENT COLLECTION · V2.1</p>
          <h1>新媒体数据采集中心</h1>
          <p>自动采集与人工导入统一入口，保留预览、校验、日志和人工确认机制。</p>
        </div>
        <div className="data-freshness"><span className="status-dot" />安全确认模式</div>
      </header>

      <nav className="collection-center-tabs" aria-label="数据采集中心功能">
        <button className={activeTab === "automatic" ? "active" : ""} onClick={() => setActiveTab("automatic")} type="button"><span>01</span><div><strong>自动采集</strong><small>抖音 V2.1 · 完整率门禁</small></div></button>
        <button className={activeTab === "import" ? "active" : ""} onClick={() => setActiveTab("import")} type="button"><span>02</span><div><strong>数据导入</strong><small>Excel · 图片上传</small></div></button>
      </nav>

      {activeTab === "automatic" ? <>

      <section className="panel workbuddy-relay-status">
        <div className="panel-heading">
          <div><span>WORKBUDDY AUTOMATIC RELAY · V1.0</span><h2>热点自动接力状态</h2></div>
          <b className={`relay-status-badge status-${relayStatus?.todayStatus?.status ?? "waiting"}`}>
            今日WorkBuddy采集：{relayStatus?.todayStatus?.status === "success" ? "成功" : relayStatus?.todayStatus?.status === "failed" ? "失败" : relayStatus?.todayStatus?.status === "processing" ? "处理中" : "待检测"}
          </b>
        </div>
        <div className="workbuddy-relay-grid">
          <article><span>今日热点入库</span><strong>{formatCompact(relayStatus?.todayStatus?.importedCount ?? 0)}</strong><small>hot_topics</small></article>
          <article><span>今日AI分析</span><strong>{formatCompact(relayStatus?.todayStatus?.analysisCount ?? 0)}</strong><small>hot_topic_analysis</small></article>
          <article><span>今日A级热点</span><strong>{formatCompact(relayStatus?.todayStatus?.gradeACount ?? 0)}</strong><small>内容策划候选</small></article>
          <article><span>今日归档</span><strong>{relayStatus?.todayStatus?.archiveGenerated ? "成功" : "未生成"}</strong><small>{relayStatus?.todayStatus?.archiveFileName ?? "失败批次不会生成档案"}</small></article>
        </div>
        <div className="workbuddy-relay-meta">
          <span>检测日期：{relayStatus?.today ?? "读取中"}</span>
          <span>最后成功：{relayStatus?.latestSuccess?.updatedAt ? formatDateTime(relayStatus.latestSuccess.updatedAt) : "暂无"}</span>
          <span>文件：{relayStatus?.todayStatus?.fileName ?? relayStatus?.latestSuccess?.fileName ?? "尚未检测"}</span>
        </div>
        {relayStatus?.todayStatus?.failedReason && (
          <div className="workbuddy-relay-failure"><strong>失败环节：{relayStatus.todayStatus.stage ?? "未知"}</strong><span>{relayStatus.todayStatus.failedReason}</span></div>
        )}
      </section>

      <section className="collector-summary-strip">
        <article><span>自动采集平台</span><strong>1 / 4</strong><small>抖音已开放</small></article>
        <article><span>采集批次</span><strong>{formatCompact(summary?.total_logs ?? 0)}</strong><small>含失败与回滚记录</small></article>
        <article><span>已入库作品</span><strong>{formatCompact(summary?.imported_posts ?? 0)}</strong><small>评论 {formatCompact(summary?.imported_comments ?? 0)} 条</small></article>
        <article><span>最近采集</span><strong className="summary-time">{summary?.latest_collection ? formatDateTime(summary.latest_collection) : "暂无"}</strong><small>Chrome / 人工确认</small></article>
      </section>

      <section className="panel collector-workflow collector-v2-workflow">
        <div className="panel-heading">
          <div><span>DOUYIN APP · V2.1</span><h2>粉丝与内容分析采集</h2></div>
          <small>固定测试范围：2026-08-01 至 2026-08-07</small>
        </div>
        <ol className="collector-steps">
          <li><span>1</span><div><strong>粉丝分析</strong><small>总量、增长、画像、兴趣与活跃时间</small></div></li>
          <li><span>2</span><div><strong>内容详情</strong><small>流量来源、完播率、平均播放时长</small></div></li>
          <li><span>3</span><div><strong>观众与评论</strong><small>年龄地域性别、评论内容与热词</small></div></li>
          <li><span>4</span><div><strong>人工确认</strong><small>预览通过后一次性写入业务表</small></div></li>
        </ol>
        <label className="collector-dropzone">
          <input accept="application/json,.json" disabled={busy} onChange={uploadV2Collection} type="file" />
          <span>V2</span>
          <div><strong>{busy ? "正在校验 V2.1 采集结果……" : "上传抖音 App V2.1 标准 JSON"}</strong><small>三类数据完整率均达到 80% 后才允许人工确认</small></div>
          <b>选择文件</b>
        </label>
        {message && <div className={`collector-message ${message.type}`}>{message.text}</div>}
        {errors.length > 0 && (
          <div className="collector-errors">
            <strong>校验错误 · {errors.length}</strong>
            <ul>{errors.slice(0, 12).map((error, index) => <li key={`v2-${error.rowNumber}-${error.field}-${index}`}>第 {error.rowNumber || "文件"} 行 · {error.message}</li>)}</ul>
          </div>
        )}

        {v2Payload && v2Summary && (
          <div className="collector-preview douyin-v2-preview">
            <div className="collector-preview-head">
              <div><strong>V{v2Payload.schemaVersion} 待确认预览</strong><small>{v2Payload.accountName} · {v2Payload.collectionRange.start.slice(0, 10)} 至 {v2Payload.collectionRange.end.slice(0, 10)}</small></div>
              <button className="primary-button" disabled={busy || !v2Summary.eligibleForConfirmation} onClick={confirmV2Collection} type="button">{v2Summary.eligibleForConfirmation ? "人工确认并入库" : "完整率未达 80%"}</button>
            </div>
            <div className="collector-summary-strip v2-preview-summary">
              <article><span>粉丝完整率</span><strong>{v2Summary.completeness.fans}%</strong><small>总量、增长与详细画像</small></article>
              <article><span>作品完整率</span><strong>{v2Summary.completeness.posts}%</strong><small>流量与观众分析</small></article>
              <article><span>评论完整率</span><strong>{v2Summary.completeness.comments}%</strong><small>数量、内容与热词</small></article>
              <article><span>综合完整率</span><strong>{v2Summary.completeness.overall}%</strong><small>门槛 {v2Summary.completeness.threshold}%</small></article>
            </div>
            <div className="collector-summary-strip v2-preview-summary">
              <article><span>粉丝总量</span><strong>{formatCompact(v2Payload.fans.total)}</strong><small>增长记录 {v2Summary.fanGrowthRecords} 条</small></article>
              <article><span>作品数据</span><strong>{v2Summary.posts}</strong><small>完整详情 {v2Summary.completePosts} 条</small></article>
              <article><span>评论内容</span><strong>{v2Summary.comments}</strong><small>失败 {v2Summary.failures} 项</small></article>
              <article><span>采集成功率</span><strong>{v2Summary.successRate}%</strong><small>确认前写入 0 条</small></article>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>作品</th><th>发布时间</th><th>播放</th><th>完播率</th><th>平均时长</th><th>观众画像</th><th>评论内容</th></tr></thead>
                <tbody>{v2Payload.posts.map((post) => (
                  <tr key={post.videoUrl}>
                    <td><a href={post.videoUrl} rel="noreferrer" target="_blank">{post.title}</a></td>
                    <td>{formatDateTime(post.publishTime)}</td>
                    <td>{formatCompact(post.views)}</td>
                    <td>{post.completionRate === null ? "未读取" : `${post.completionRate}%`}</td>
                    <td>{post.averagePlayDuration === null ? "未读取" : `${post.averagePlayDuration} 秒`}</td>
                    <td>{post.audience.age.length + post.audience.gender.length + post.audience.region.length ? "已读取" : "未读取"}</td>
                    <td>{post.comments.length} / {post.commentsCount}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {v2Payload.failures.length > 0 && <details className="collector-failure-details"><summary>失败原因 · {v2Payload.failures.length} 项</summary><ul>{v2Payload.failures.map((failure, index) => <li key={`${failure.target}-${index}`}><strong>{failure.target} / {failure.stage}</strong>：{failure.reason}</li>)}</ul></details>}
            {v2Summary.failedFields.length > 0 && <details className="collector-failure-details"><summary>缺失字段 · {v2Summary.failedFields.length} 项</summary><ul>{v2Summary.failedFields.map((field) => <li key={field}>{field}</li>)}</ul></details>}
          </div>
        )}
      </section>

      <section className="panel collector-progress-panel">
        <div className="panel-heading">
          <div><span>30-DAY TEST PROGRESS</span><h2>30 天采集进度</h2></div>
          <small>{activeRange ? `${activeRange.start.slice(0, 10)} 至 ${activeRange.end.slice(0, 10)}` : "上传采集文件后显示结果"}</small>
        </div>
        <div className="collector-progress-track" aria-label="采集进度">
          <span style={{ width: `${activeProgress?.percent ?? 0}%` }} />
        </div>
        <div className="collector-progress-meta">
          <strong>{activeProgress?.percent ?? 0}%</strong>
          <span>{activeProgress ? `${activeProgress.processed} / ${activeProgress.total} · ${activeProgress.stage}` : "等待作品或评论采集预览"}</span>
          <small>{activeFailures.length ? `${activeFailures.length} 项失败已记录` : "暂无失败记录"}</small>
        </div>
        {activeFailures.length > 0 && (
          <details className="collector-failure-details">
            <summary>查看失败明细</summary>
            <ul>{activeFailures.map((failure, index) => <li key={`${failure.target}-${index}`}><strong>{failure.target}</strong>：{failure.reason}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="panel collector-workflow">
        <div className="panel-heading">
          <div><span>DOUYIN COMMENTS · V1.0</span><h2>抖音评论详情采集</h2></div>
          <small>逐条进入评论详情；单作品最多 50 条，单批最多 20 个作品</small>
        </div>
        <label className="collector-dropzone">
          <input accept="application/json,.json" disabled={busy} onChange={uploadCommentCollection} type="file" />
          <span>评论</span>
          <div><strong>{busy ? "正在校验评论文件……" : "上传抖音评论采集结果"}</strong><small>预览确认后才写入 social_comments</small></div>
          <b>选择文件</b>
        </label>
        {commentPayload && (
          <div className="collector-preview">
            <div className="collector-preview-head">
              <div><strong>待入库评论 · {commentPayload.rows.length} 条</strong><small>{new Set(commentPayload.rows.map((row) => row.postUrl)).size} 个作品</small></div>
              <button className="primary-button" disabled={busy} onClick={confirmCommentCollection} type="button">确认写入 social_comments</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>用户名</th><th>评论内容</th><th>评论时间</th><th>点赞</th><th>作品</th></tr></thead>
                <tbody>{commentPayload.rows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.postUrl}-${row.username}`}>
                    <td>{row.username}</td><td>{row.commentText}</td><td>{formatDateTime(row.commentTime)}</td><td>{row.likes}</td><td><a href={row.postUrl} rel="noreferrer" target="_blank">查看作品</a></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="collector-module-grid">
        <article className="panel collector-module active-module">
          <div className="collector-module-head"><span>01</span><b>V1.0 已开放</b></div>
          <h2>Chrome 自动采集</h2>
          <p>在已登录的抖音创作者作品管理页按日期提取数据，导出标准 JSON。</p>
          <div className="collector-capabilities"><span>✓ 仅抖音</span><span>✓ 30 天范围</span><span>✓ 进度与失败记录</span></div>
          <a className="primary-button collector-download" href="/chrome-extension/douyin-collector-v1.zip" download>
            下载 Chrome 采集器
          </a>
        </article>
        <article className="panel collector-module">
          <div className="collector-module-head"><span>02</span><b>复用现有能力</b></div>
          <h2>Excel 人工导入</h2>
          <p>按导入字段人工整理数据，上传后预览、校验并确认写入正式作品库。</p>
          <button className="secondary-button collector-link" onClick={() => setActiveTab("import")} type="button">进入数据导入</button>
        </article>
        <article className="panel collector-module validation-module">
          <div className="collector-module-head"><span>03</span><b>统一规则</b></div>
          <h2>数据校验</h2>
          <p>校验平台、日期、非负指标和作品链接；确认后新增作品、更新已有指标并跳过重复评论。</p>
          <div className="collector-capabilities"><span>人工确认</span><span>安全去重</span><span>批次回滚</span></div>
        </article>
      </section>

      <section className="panel collector-workflow">
        <div className="panel-heading">
          <div><span>DOUYIN COLLECTION</span><h2>抖音 Chrome 采集入库</h2></div>
          <small>登录与验证码由运营人员在 Chrome 中自行完成</small>
        </div>
        <ol className="collector-steps">
          <li><span>1</span><div><strong>安装扩展</strong><small>解压后通过开发者模式加载</small></div></li>
          <li><span>2</span><div><strong>打开作品管理</strong><small>登录有权管理的抖音账号</small></div></li>
          <li><span>3</span><div><strong>采集并导出</strong><small>读取近 30 天作品与评论</small></div></li>
          <li><span>4</span><div><strong>上传并确认</strong><small>校验通过后写入 social_posts</small></div></li>
        </ol>

        <label className="collector-dropzone">
          <input accept="application/json,.json" disabled={busy} onChange={uploadCollection} type="file" />
          <span>JSON</span>
          <div><strong>{busy ? "正在校验采集文件……" : "上传 Chrome 采集结果"}</strong><small>仅支持采集器导出的 2MB 以内 JSON 文件</small></div>
          <b>选择文件</b>
        </label>

        {message && <div className={`collector-message ${message.type}`}>{message.text}</div>}
        {errors.length > 0 && (
          <div className="collector-errors">
            <strong>校验错误 · {errors.length}</strong>
            <ul>{errors.slice(0, 12).map((error, index) => <li key={`${error.rowNumber}-${error.field}-${index}`}>第 {error.rowNumber || "文件"} 行 · {error.message}</li>)}</ul>
          </div>
        )}

        {payload && (
          <div className="collector-preview">
            <div className="collector-preview-head">
              <div><strong>待入库数据 · {payload.rows.length} 条</strong><small>来源：{payload.pageUrl}</small></div>
              <button className="primary-button" disabled={busy} onClick={confirmCollection} type="button">确认写入 social_posts</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>作品标题</th><th>发布时间</th><th>播放</th><th>点赞</th><th>评论</th><th>收藏</th><th>分享</th></tr></thead>
                <tbody>{payload.rows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.videoUrl}`}>
                    <td><a href={row.videoUrl} rel="noreferrer" target="_blank">{row.title}</a></td>
                    <td>{formatDateTime(row.publishTime)}</td><td>{formatCompact(row.views)}</td><td>{formatCompact(row.likes)}</td><td>{formatCompact(row.comments)}</td><td>{formatCompact(row.favorites)}</td><td>{formatCompact(row.shares)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="panel collector-log-panel">
        <div className="panel-heading">
          <div><span>COLLECTION LOGS</span><h2>采集日志</h2></div>
          <small>记录成功、失败和回滚批次</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>批次</th><th>平台 / 来源</th><th>状态</th><th>采集数量</th><th>成功 / 错误</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td><strong>#{log.id}</strong><small>{log.source_name}</small></td>
                  <td>抖音<small>{log.entity_type === "workbuddy_relay" ? "WorkBuddy热点自动接力" : log.entity_type === "douyin_v2" ? "粉丝与内容分析 V2.1" : log.entity_type === "comment" ? "评论详情采集" : "作品基础采集"}</small></td>
                  <td><span className={`collection-status status-${log.status}`}>{statusNames[log.status] ?? log.status}</span></td>
                  <td>{log.total_count}</td><td>{log.success_count} / {log.error_count}{log.entity_type === "comment" && <small>评论 {log.comment_count}</small>}{log.error_message && <small className="log-error-summary" title={log.error_message}>含失败明细</small>}</td><td>{formatDateTime(log.created_at)}</td>
                  <td>{log.status === "completed" ? <button className="text-button danger-text" onClick={() => rollbackCollection(log.id, log.entity_type)} type="button">回滚数据</button> : "—"}</td>
                </tr>
              ))}
              {!logs.length && <tr><td className="empty-cell" colSpan={7}>暂无采集记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="collector-compliance">采集器不读取 Cookie、密码或浏览历史，不绕过登录、验证码和平台限制；仅可采集运营方有权管理的账号数据。</p>
      </> : <DataImportPanel embedded />}
    </div>
  );
}
