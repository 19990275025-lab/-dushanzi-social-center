"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import type { CollectionPayload, CollectionValidationError } from "@/lib/collections";
import { formatCompact, formatDateTime } from "@/lib/format";

type CollectionLog = {
  id: number;
  platform: string;
  source_type: string;
  source_name: string;
  source_url: string | null;
  status: string;
  total_count: number;
  success_count: number;
  error_count: number;
  collected_at: string | null;
  created_at: string;
};

type Summary = {
  total_logs: number;
  imported_posts: number;
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
  const [logId, setLogId] = useState<number | null>(null);
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

  async function rollbackCollection(id: number) {
    if (!window.confirm("确认回滚该采集批次写入的作品？采集日志仍会保留。")) return;
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
          <p>Chrome 自动提取、统一校验、人工确认入库；第一阶段仅开放抖音。</p>
        </div>
        <div className="data-freshness"><span className="status-dot" />安全确认模式</div>
      </header>

      <section className="collector-summary-strip">
        <article><span>自动采集平台</span><strong>1 / 4</strong><small>抖音已开放</small></article>
        <article><span>采集批次</span><strong>{formatCompact(summary?.total_logs ?? 0)}</strong><small>含失败与回滚记录</small></article>
        <article><span>已入库作品</span><strong>{formatCompact(summary?.imported_posts ?? 0)}</strong><small>统一进入 social_posts</small></article>
        <article><span>最近采集</span><strong className="summary-time">{summary?.latest_collection ? formatDateTime(summary.latest_collection) : "暂无"}</strong><small>Chrome / 人工确认</small></article>
      </section>

      <section className="collector-module-grid">
        <article className="panel collector-module active-module">
          <div className="collector-module-head"><span>01</span><b>V1.0 已开放</b></div>
          <h2>Chrome 自动采集</h2>
          <p>在已登录的抖音创作者作品管理页提取当前已加载数据，导出标准 JSON。</p>
          <div className="collector-capabilities"><span>✓ 抖音</span><span>✓ 当前页面</span><span>✓ 最多 100 条</span></div>
          <a className="primary-button collector-download" href="/chrome-extension/douyin-collector-v1.zip" download>
            下载 Chrome 采集器
          </a>
        </article>
        <article className="panel collector-module">
          <div className="collector-module-head"><span>02</span><b>复用现有能力</b></div>
          <h2>Excel 人工导入</h2>
          <p>使用标准模板人工整理数据，上传后预览、校验并确认写入正式作品库。</p>
          <a className="secondary-button collector-link" href="/imports">进入 Excel 导入中心</a>
        </article>
        <article className="panel collector-module">
          <div className="collector-module-head"><span>03</span><b>标准资产</b></div>
          <h2>数据模板管理</h2>
          <p>下载四个平台作品模板和竞品模板，保持人工与自动数据口径一致。</p>
          <a className="secondary-button collector-link" href="/data-templates">查看数据模板</a>
        </article>
        <article className="panel collector-module validation-module">
          <div className="collector-module-head"><span>04</span><b>统一规则</b></div>
          <h2>数据校验</h2>
          <p>校验平台、日期、非负指标、作品链接和重复作品，任何错误均阻止整批入库。</p>
          <div className="collector-capabilities"><span>事务写入</span><span>重复拦截</span><span>整批回滚</span></div>
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
          <li><span>3</span><div><strong>采集并导出</strong><small>读取当前页面已显示数据</small></div></li>
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
                  <td>抖音<small>Chrome 自动采集</small></td>
                  <td><span className={`collection-status status-${log.status}`}>{statusNames[log.status] ?? log.status}</span></td>
                  <td>{log.total_count}</td><td>{log.success_count} / {log.error_count}</td><td>{formatDateTime(log.created_at)}</td>
                  <td>{log.status === "completed" ? <button className="text-button danger-text" onClick={() => rollbackCollection(log.id)} type="button">回滚数据</button> : "—"}</td>
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
