"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import type { CollectionPayload, CollectionValidationError } from "@/lib/collections";
import type { CommentCollectionPayload } from "@/lib/comment-collections";
import { formatCompact, formatDateTime } from "@/lib/format";

type CollectionLog = {
  id: number;
  platform: string;
  source_type: string;
  source_name: string;
  source_url: string | null;
  entity_type: "post" | "comment";
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

const statusNames: Record<string, string> = {
  pending: "待确认",
  completed: "已入库",
  failed: "校验失败",
  deleted: "已回滚",
};

export default function CollectorPage() {
  const [payload, setPayload] = useState<CollectionPayload | null>(null);
  const [commentPayload, setCommentPayload] = useState<CommentCollectionPayload | null>(null);
  const [logId, setLogId] = useState<number | null>(null);
  const [commentLogId, setCommentLogId] = useState<number | null>(null);
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
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

  async function rollbackCollection(id: number, entityType: "post" | "comment") {
    if (!window.confirm(`确认回滚该采集批次写入的${entityType === "comment" ? "评论" : "作品"}？采集日志仍会保留。`)) return;
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
          <p className="eyebrow">SMART COLLECTION CENTER · V1.0</p>
          <h1>新媒体智能采集中心</h1>
          <p>抖音近 30 天作品与评论采集、统一校验、进度追踪、人工确认入库。</p>
        </div>
        <div className="data-freshness"><span className="status-dot" />安全确认模式</div>
      </header>

      <section className="collector-summary-strip">
        <article><span>自动采集平台</span><strong>1 / 4</strong><small>抖音已开放</small></article>
        <article><span>采集批次</span><strong>{formatCompact(summary?.total_logs ?? 0)}</strong><small>含失败与回滚记录</small></article>
        <article><span>已入库作品</span><strong>{formatCompact(summary?.imported_posts ?? 0)}</strong><small>评论 {formatCompact(summary?.imported_comments ?? 0)} 条</small></article>
        <article><span>最近采集</span><strong className="summary-time">{summary?.latest_collection ? formatDateTime(summary.latest_collection) : "暂无"}</strong><small>Chrome / 人工确认</small></article>
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
          <a className="secondary-button collector-link" href="/imports">进入 Excel 导入中心</a>
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
                  <td>抖音<small>{log.entity_type === "comment" ? "评论详情采集" : "作品基础采集"}</small></td>
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
    </div>
  );
}
