"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ImportPostRow } from "@/lib/imports";
import { validateImportRows } from "@/lib/imports";
import { formatDateTime, platformLabel } from "@/lib/format";

type ImportType = "excel" | "image";
type PreviewRow = ImportPostRow & { errors: string[] };
type ImportLog = {
  id: number;
  platform: string;
  file_name: string;
  import_type: ImportType;
  status: string;
  success_count: number;
  error_count: number;
  created_at: string;
};

const platformOptions = [
  { value: "douyin", label: "抖音", note: "短视频 / 直播" },
  { value: "kuaishou", label: "快手", note: "短视频 / 直播" },
  { value: "weibo", label: "微博", note: "视频 / 图文" },
];

const statusNames: Record<string, string> = {
  pending: "待确认",
  completed: "已完成",
  failed: "存在错误",
  deleted: "已回滚",
};

const headerAliases = {
  title: ["标题", "作品标题", "title"],
  platform: ["平台", "platform"],
  publishTime: ["发布时间", "发布于", "publish_time", "publishTime"],
  views: ["播放量", "播放", "views"],
  likes: ["点赞", "点赞量", "likes"],
  comments: ["评论", "评论量", "comments"],
  favorites: ["收藏", "收藏量", "favorites"],
  shares: ["分享", "分享量", "shares"],
  fansGrowth: ["涨粉", "涨粉数", "fans_growth", "fansGrowth"],
} as const;

function readAlias(row: Record<string, unknown>, aliases: readonly string[]) {
  for (const key of aliases) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return undefined;
}

function normalizePlatform(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    抖音: "douyin",
    快手: "kuaishou",
    微博: "weibo",
    douyin: "douyin",
    kuaishou: "kuaishou",
    weibo: "weibo",
  };
  return aliases[normalized] ?? normalized;
}

function toInteger(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(numeric) ? Math.trunc(numeric) : Number.NaN;
}

function toIsoDate(value: unknown, xlsx: typeof import("xlsx")) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(
        Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)),
      ).toISOString();
    }
  }
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function DataImportPanel({ embedded = false }: { embedded?: boolean }) {
  const [platform, setPlatform] = useState("douyin");
  const [importType, setImportType] = useState<ImportType>("excel");
  const [fileName, setFileName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [logId, setLogId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLogs = useCallback(() => {
    fetch("/api/imports")
      .then((response) => response.json() as Promise<{ logs: ImportLog[] }>)
      .then((result) => setLogs(result.logs));
  }, []);

  useEffect(loadLogs, [loadLogs]);
  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  function resetPreview() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setFileName("");
    setImagePreview("");
    setPreviewRows([]);
    setLogId(null);
    setMessage(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function parseExcel(file: File): Promise<PreviewRow[]> {
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel 中没有可读取的工作表");
    const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: "",
      raw: true,
    });

    const rows: ImportPostRow[] = rawRows.map((row, index) => ({
      rowNumber: index + 2,
      title: String(readAlias(row, headerAliases.title) ?? "").trim(),
      platform: normalizePlatform(readAlias(row, headerAliases.platform)),
      publishTime: toIsoDate(readAlias(row, headerAliases.publishTime), xlsx),
      views: toInteger(readAlias(row, headerAliases.views)),
      likes: toInteger(readAlias(row, headerAliases.likes)),
      comments: toInteger(readAlias(row, headerAliases.comments)),
      favorites: toInteger(readAlias(row, headerAliases.favorites)),
      shares: toInteger(readAlias(row, headerAliases.shares)),
      fansGrowth: toInteger(readAlias(row, headerAliases.fansGrowth)),
    }));

    const errors = validateImportRows(rows, platform);
    return rows.map((row) => ({
      ...row,
      errors: errors.filter((error) => error.rowNumber === row.rowNumber).map((error) => error.message),
    }));
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setPreviewRows([]);
    setLogId(null);
    setFileName(file.name);

    const form = new FormData();
    form.set("platform", platform);
    form.set("importType", importType);
    form.set("file", file);
    let uploadedLogId: number | null = null;

    try {
      const uploadResponse = await fetch("/api/imports", { method: "POST", body: form });
      const uploadResult = (await uploadResponse.json()) as { log?: ImportLog; error?: string };
      if (!uploadResponse.ok || !uploadResult.log) {
        throw new Error(uploadResult.error ?? "文件上传失败");
      }
      uploadedLogId = uploadResult.log.id;
      setLogId(uploadResult.log.id);

      if (importType === "image") {
        setImagePreview(URL.createObjectURL(file));
        setMessage({ type: "success", text: "图片已安全保存，等待人工确认；OCR 尚未启用。" });
      } else {
        const rows = await parseExcel(file);
        setPreviewRows(rows);
        const errorCount = rows.reduce((sum, row) => sum + row.errors.length, 0);
        await fetch("/api/imports", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: uploadResult.log.id,
            status: errorCount ? "failed" : "pending",
            errorCount,
          }),
        });
        setMessage({
          type: errorCount ? "error" : "success",
          text: errorCount
            ? `识别到 ${rows.length} 行，其中 ${errorCount} 个错误；修正后请重新导入。`
            : `成功识别 ${rows.length} 条作品，确认后才会写入数据库。`,
        });
      }
      loadLogs();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "文件处理失败";
      setMessage({ type: "error", text });
      if (uploadedLogId) {
        await fetch("/api/imports", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: uploadedLogId, status: "failed", errorCount: 1 }),
        });
      }
      loadLogs();
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!logId) return;
    const errorCount = previewRows.reduce((sum, row) => sum + row.errors.length, 0);
    if (importType === "excel" && errorCount) {
      setMessage({ type: "error", text: "存在错误数据，当前批次不会写入数据库。" });
      return;
    }

    setBusy(true);
    const response = await fetch("/api/imports/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        logId,
        platform,
        importType,
        rows: importType === "excel" ? previewRows : [],
      }),
    });
    const result = (await response.json()) as {
      message?: string;
      error?: string;
      errors?: Array<{ rowNumber: number; message: string }>;
    };
    setBusy(false);

    if (!response.ok) {
      if (result.errors?.length) {
        setPreviewRows((rows) =>
          rows.map((row) => ({
            ...row,
            errors: [
              ...row.errors,
              ...result.errors!.filter((item) => item.rowNumber === row.rowNumber).map((item) => item.message),
            ],
          })),
        );
      }
      setMessage({ type: "error", text: result.error ?? "数据确认失败" });
      loadLogs();
      return;
    }

    setMessage({ type: "success", text: result.message ?? "导入成功" });
    loadLogs();
  }

  async function deleteImport(id: number) {
    if (!window.confirm("确认删除该批次写入的作品数据？导入日志会继续保留。")) return;
    const response = await fetch(`/api/imports?id=${id}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? { type: "success", text: "该批次写入的数据已回滚，导入记录已保留。" }
        : { type: "error", text: result.error ?? "删除失败" },
    );
    loadLogs();
  }

  function retryImport(log: ImportLog) {
    setPlatform(log.platform);
    setImportType(log.import_type);
    resetPreview();
    window.setTimeout(() => fileInput.current?.click(), 0);
  }

  const totalErrors = previewRows.reduce((sum, row) => sum + row.errors.length, 0);
  const accept = importType === "excel" ? ".xlsx,.xls" : ".png,.jpg,.jpeg,.webp";

  return (
    <div className={embedded ? "page-stack embedded-import-panel" : "page-stack"}>
      {!embedded && <header className="page-heading compact-heading">
        <div>
          <p className="eyebrow">INTELLIGENT DATA INTAKE</p>
          <h1>新媒体智能数据导入中心</h1>
          <p>先识别、再预览、后确认；任何错误都不会污染正式作品数据。</p>
        </div>
        <div className="data-freshness"><span className="status-dot" />安全导入模式</div>
      </header>}

      <section className="import-step-grid">
        <article className="panel import-step-panel">
          <div className="step-heading"><span>01</span><div><strong>选择平台</strong><small>本批数据归属</small></div></div>
          <div className="import-platforms">
            {platformOptions.map((item) => (
              <button
                className={platform === item.value ? `import-platform active platform-${item.value}` : `import-platform platform-${item.value}`}
                key={item.value}
                onClick={() => { setPlatform(item.value); resetPreview(); }}
                type="button"
              >
                <span className="platform-mark">{item.label.slice(0, 1)}</span>
                <div><strong>{item.label}</strong><small>{item.note}</small></div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel import-step-panel">
          <div className="step-heading"><span>02</span><div><strong>选择导入方式</strong><small>Excel 或数据截图</small></div></div>
          <div className="import-type-switch">
            <button className={importType === "excel" ? "active" : ""} onClick={() => { setImportType("excel"); resetPreview(); }} type="button">
              <span>XLS</span><div><strong>Excel 上传</strong><small>解析 social_posts 字段</small></div>
            </button>
            <button className={importType === "image" ? "active" : ""} onClick={() => { setImportType("image"); resetPreview(); }} type="button">
              <span>IMG</span><div><strong>图片上传</strong><small>保存后人工确认</small></div>
            </button>
          </div>
        </article>
      </section>

      <section className="panel upload-panel">
        <div className="step-heading"><span>03</span><div><strong>上传与识别</strong><small>{platformLabel(platform)} · {importType === "excel" ? "Excel 数据表" : "运营截图"}</small></div></div>
        <input ref={fileInput} className="visually-hidden" type="file" accept={accept} onChange={uploadFile} />
        <button className="drop-zone" disabled={busy} onClick={() => fileInput.current?.click()} type="button">
          <span className="upload-symbol">↑</span>
          <strong>{busy ? "正在安全处理文件…" : fileName || "点击选择文件"}</strong>
          <small>{importType === "excel" ? "支持 XLSX / XLS，最大 5MB，单次最多 200 条" : "支持 PNG / JPG / WEBP，最大 8MB；当前不执行 OCR"}</small>
        </button>
        <div className="field-map">
          <span>Excel 字段映射</span>
          {['标题', '平台', '发布时间', '播放量', '点赞', '评论', '收藏', '分享', '涨粉'].map((field) => <i key={field}>{field}</i>)}
        </div>
      </section>

      {message && <div className={`import-message ${message.type}`}>{message.type === "success" ? "✓" : "!"}<span>{message.text}</span></div>}

      {(fileName || previewRows.length > 0) && (
        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">DATA PREVIEW</span><h2>数据预览</h2></div>
            <div className="preview-meta"><span>{fileName}</span><strong>{importType === "excel" ? `${previewRows.length} 条待写入 · ${totalErrors} 个错误` : "图片待人工确认"}</strong></div>
          </div>

          {importType === "image" ? (
            <div className="image-confirmation">
              {imagePreview && <img src={imagePreview} alt={`${fileName} 上传预览`} />}
              <div><strong>OCR 接口已预留</strong><p>V1.0 仅保存原图和导入记录。请人工检查图片属于 {platformLabel(platform)}，确认后将记录标记为完成。</p></div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="import-preview-table">
                <thead><tr><th>行</th><th>识别结果</th><th>标题</th><th>平台</th><th>发布时间</th><th>播放</th><th>点赞</th><th>评论</th><th>收藏</th><th>分享</th><th>涨粉</th></tr></thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr className={row.errors.length ? "row-error" : ""} key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td><span className={row.errors.length ? "recognition-error" : "recognition-ok"}>{row.errors.length ? row.errors.join("；") : "可写入"}</span></td>
                      <td><strong>{row.title || "—"}</strong></td>
                      <td>{platformLabel(row.platform)}</td>
                      <td className="date-cell">{row.publishTime ? formatDateTime(row.publishTime) : "—"}</td>
                      <td>{row.views}</td><td>{row.likes}</td><td>{row.comments}</td><td>{row.favorites}</td><td>{row.shares}</td><td>{row.fansGrowth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="confirm-bar">
            <div><strong>确认写入</strong><span>{importType === "excel" ? "确认后数据将进入 social_posts，并立即反映到驾驶舱。" : "确认图片记录，等待未来 OCR 或人工录入。"}</span></div>
            <button className="primary-button" disabled={busy || !logId || (importType === "excel" && (previewRows.length === 0 || totalErrors > 0))} onClick={confirmImport}>
              {busy ? "处理中…" : importType === "excel" ? `确认导入 ${previewRows.length} 条` : "人工确认图片"}
            </button>
          </div>
        </section>
      )}

      <section className="panel data-panel import-history">
        <div className="panel-heading">
          <div><span className="section-kicker">IMPORT HISTORY</span><h2>导入记录</h2></div>
          <span className="section-note">错误批次可重新导入；完成批次可回滚数据</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>文件名称</th><th>平台</th><th>方式</th><th>状态</th><th>成功</th><th>错误</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td><strong>{log.file_name}</strong></td>
                  <td><span className={`platform-tag tag-${log.platform}`}>{platformLabel(log.platform)}</span></td>
                  <td>{log.import_type === "excel" ? "Excel" : "图片"}</td>
                  <td><span className={`import-status status-${log.status}`}>{statusNames[log.status] ?? log.status}</span></td>
                  <td className="metric-cell">{log.success_count}</td><td>{log.error_count}</td>
                  <td className="date-cell">{formatDateTime(log.created_at)}</td>
                  <td><div className="row-actions">
                    {log.status !== "deleted" && <button onClick={() => retryImport(log)} type="button">重新导入</button>}
                    {log.status === "completed" && <button className="danger-link" onClick={() => deleteImport(log.id)} type="button">回滚数据</button>}
                  </div></td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td className="empty-cell" colSpan={8}>暂无导入记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function ImportsPage() {
  return <DataImportPanel />;
}
