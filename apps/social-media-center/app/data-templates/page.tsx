"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type TemplateItem = {
  key: string;
  type: "social" | "competitor";
  platform: string;
  title: string;
  file: string;
  fields: string[];
};

type ValidationRule = { key: string; label: string; description: string };
type ValidationError = { row: number; field: string; message: string; value: string };
type ValidationResult = {
  valid: boolean;
  fileName: string;
  templateKey: string;
  templateTitle: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ValidationError[];
  truncated: boolean;
  message: string;
};

export default function DataTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [templateKey, setTemplateKey] = useState("douyin");
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState("");

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/data-templates");
      if (!response.ok) throw new Error("模板信息读取失败");
      const data = await response.json() as { templates: TemplateItem[]; validationRules: ValidationRule[] };
      setTemplates(data.templates);
      setRules(data.validationRules);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "模板信息读取失败");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTemplates(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTemplates]);

  async function validateFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("请选择需要校验的 Excel 文件");
      return;
    }
    setValidating(true);
    setError("");
    setResult(null);
    const form = new FormData();
    form.set("templateKey", templateKey);
    form.set("file", file);

    try {
      const response = await fetch("/api/data-templates", { method: "POST", body: form });
      const data = await response.json() as { result?: ValidationResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error ?? "文件校验失败");
      setResult(data.result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件校验失败");
    } finally {
      setValidating(false);
    }
  }

  const socialTemplates = templates.filter((item) => item.type === "social");
  const competitorTemplate = templates.find((item) => item.type === "competitor");

  return (
    <div className="page-stack data-template-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">DATA ASSET STANDARD</p><h1>新媒体数据资产采集模板中心</h1><p>统一人工采集字段、Excel 格式和校验口径，为真实数据导入与 AI 分析建立可靠入口。</p></div>
        <div className="data-freshness"><span className="status-dot" />模板版本 V1.0</div>
      </header>

      <section className="template-summary-strip">
        <article><span>标准模板</span><strong>5</strong><small>4 个平台 + 1 个竞品</small></article>
        <article><span>作品字段</span><strong>13</strong><small>覆盖核心表现指标</small></article>
        <article><span>竞品字段</span><strong>9</strong><small>支持爆款原因记录</small></article>
        <article><span>校验规则</span><strong>3</strong><small>日期、数字、平台</small></article>
      </section>

      <section className="collection-flow panel">
        <div className="panel-heading"><div><span className="section-kicker">COLLECTION FLOW</span><h2>真实数据采集流程</h2></div><span className="section-note">人工采集阶段不连接平台账号</span></div>
        <ol><li><span>01</span><div><strong>下载标准模板</strong><p>按平台选择作品模板，竞品分析使用独立模板。</p></div></li><li><span>02</span><div><strong>人工采集填写</strong><p>保留原始链接和采集备注，不修改字段名称或顺序。</p></div></li><li><span>03</span><div><strong>执行格式校验</strong><p>检查日期、数字、平台名称和必填字段。</p></div></li><li><span>04</span><div><strong>进入导入中心</strong><p>校验通过后，在数据导入中心预览并确认写入。</p></div></li></ol>
      </section>

      <section>
        <div className="section-title"><div><span className="section-kicker">SOCIAL POST TEMPLATES</span><h2>新媒体数据采集模板</h2></div><span className="section-note">Excel · 数据页 + 填写说明 + 示例页</span></div>
        <div className="template-card-grid">
          {socialTemplates.map((item, index) => <article className={`template-card platform-${item.key}`} key={item.key}><div className="template-card-head"><div className="platform-mark">{item.platform.slice(0, 1)}</div><div><span>0{index + 1}</span><h3>{item.title}</h3></div></div><div className="template-fields">{item.fields.map((field) => <span key={field}>{field}</span>)}</div><div className="template-card-footer"><small>{item.fields.length} 个标准字段</small><a className="template-download" href={item.file} download>下载 Excel <b>↓</b></a></div></article>)}
        </div>
      </section>

      {competitorTemplate && <section className="panel competitor-template-panel">
        <div className="competitor-template-copy"><span className="section-kicker">COMPETITOR TEMPLATE</span><h2>竞品账号数据模板</h2><p>记录竞品账号的作品表现与爆款原因，用于后续同行对标和选题复盘。</p><div className="template-fields large">{competitorTemplate.fields.map((field) => <span key={field}>{field}</span>)}</div></div>
        <div className="competitor-template-action"><span>Excel</span><strong>{competitorTemplate.fields.length} 个字段</strong><small>覆盖四个平台</small><a className="primary-button" href={competitorTemplate.file} download>下载竞品模板</a></div>
      </section>}

      <section className="validation-layout">
        <article className="panel validation-rules-panel">
          <div className="panel-heading"><div><span className="section-kicker">VALIDATION RULES</span><h2>数据校验规则</h2></div></div>
          <div className="validation-rule-list">{rules.map((rule, index) => <div key={rule.key}><span>0{index + 1}</span><div><strong>{rule.label}</strong><p>{rule.description}</p></div></div>)}</div>
          <div className="validation-safety-note"><strong>安全边界</strong><p>校验文件只在本次请求的服务器内存中解析，不上传对象存储、不写数据库，也不会触发已有导入流程。</p></div>
        </article>

        <article className="panel file-validator-panel">
          <div className="panel-heading"><div><span className="section-kicker">FILE CHECK</span><h2>填写结果校验</h2></div><span className="rule-badge">只检查 · 不入库</span></div>
          <form onSubmit={validateFile} className="template-validation-form">
            <label>模板类型<select value={templateKey} onChange={(event) => { setTemplateKey(event.target.value); setResult(null); }}>
              {templates.map((item) => <option value={item.key} key={item.key}>{item.title}</option>)}
            </select></label>
            <label className="template-file-control"><span>选择 Excel</span><input type="file" accept=".xlsx,.xls" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} /><strong>{file?.name ?? "请选择已填写的模板"}</strong><small>支持 .xlsx / .xls，最大 5MB</small></label>
            <button className="primary-button" disabled={validating || !templates.length}>{validating ? "校验中…" : "开始校验"}</button>
          </form>

          {error && <div className="import-message error"><span>!</span>{error}</div>}
          {result && <div className={result.valid ? "template-validation-result valid" : "template-validation-result invalid"}><div className="validation-result-head"><span>{result.valid ? "✓" : "!"}</span><div><strong>{result.message}</strong><small>{result.fileName} · {result.templateTitle}</small></div></div><div className="validation-result-metrics"><div><span>数据行</span><strong>{result.totalRows}</strong></div><div><span>通过</span><strong>{result.validRows}</strong></div><div><span>错误行</span><strong>{result.errorRows}</strong></div></div>{result.errors.length > 0 && <div className="validation-errors"><div className="validation-errors-head"><strong>问题明细</strong><span>最多显示 200 条</span></div><div className="table-wrap"><table><thead><tr><th>行号</th><th>字段</th><th>问题</th><th>当前值</th></tr></thead><tbody>{result.errors.map((item, index) => <tr key={`${item.row}-${item.field}-${index}`}><td>{item.row}</td><td>{item.field}</td><td>{item.message}</td><td>{item.value || "—"}</td></tr>)}</tbody></table></div></div>}</div>}
        </article>
      </section>
    </div>
  );
}
