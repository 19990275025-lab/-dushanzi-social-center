import * as XLSX from "xlsx";
import {
  competitorTemplateFields,
  contentTypeNames,
  dataTemplates,
  platformNames,
  socialTemplateFields,
  validationRules,
} from "@/lib/data-template-schema";

type ValidationError = { row: number; field: string; message: string; value: string };

const nonNegativeSocialFields = ["播放量", "点赞量", "评论量", "收藏量", "分享量"];
const nonNegativeCompetitorFields = ["播放量", "点赞", "评论", "收藏"];
const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;

function displayValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function isInteger(value: unknown, allowNegative = false) {
  if (typeof value === "number") return Number.isInteger(value) && (allowNegative || value >= 0);
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  return (allowNegative ? /^-?\d+$/ : /^\d+$/).test(normalized);
}

function isValidDate(value: unknown) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return datePattern.test(String(value ?? "").trim());
}

function validateHeaders(actual: string[], expected: readonly string[]) {
  const errors: ValidationError[] = [];
  expected.forEach((field) => {
    if (!actual.includes(field)) errors.push({ row: 1, field, message: `缺少必需字段“${field}”`, value: "" });
  });
  actual.filter(Boolean).forEach((field) => {
    if (!expected.includes(field as never)) errors.push({ row: 1, field, message: `存在未定义字段“${field}”`, value: field });
  });
  return errors;
}

export async function GET() {
  return Response.json({ templates: dataTemplates, validationRules, updatedAt: new Date().toISOString() });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const templateKey = String(form.get("templateKey") ?? "");
  const template = dataTemplates.find((item) => item.key === templateKey);
  if (!(file instanceof File) || !template) return Response.json({ error: "请选择模板类型和 Excel 文件" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "文件不能超过 5MB" }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name)) return Response.json({ error: "仅支持 .xlsx 或 .xls 文件" }, { status: 400 });

  try {
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return Response.json({ error: "Excel 中没有可读取的工作表" }, { status: 400 });
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const expectedFields = template.type === "competitor" ? competitorTemplateFields : socialTemplateFields;
    const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
    const errors = validateHeaders(headers, expectedFields);
    const dataRows = matrix.slice(1).filter((row) => row.some((value) => String(value ?? "").trim() !== ""));
    const requiredFields = template.type === "competitor"
      ? ["平台", "账号名称", "作品标题", "发布时间", ...nonNegativeCompetitorFields]
      : ["平台", "作品标题", "发布时间", "内容类型", ...nonNegativeSocialFields];

    dataRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const record = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
      requiredFields.forEach((field) => {
        if (record[field] === "" || record[field] === null || record[field] === undefined) errors.push({ row: rowNumber, field, message: "必填字段不能为空", value: "" });
      });

      const platform = String(record["平台"] ?? "").trim();
      if (platform && !platformNames.includes(platform as never)) errors.push({ row: rowNumber, field: "平台", message: "平台名称必须为抖音、快手、微博或视频号", value: platform });
      if (template.type === "social" && platform && platform !== template.platform) errors.push({ row: rowNumber, field: "平台", message: `该模板的平台必须填写“${template.platform}”`, value: platform });

      const publishTime = record["发布时间"];
      if (publishTime !== "" && !isValidDate(publishTime)) errors.push({ row: rowNumber, field: "发布时间", message: "请使用 Excel 日期或 YYYY-MM-DD HH:mm:ss", value: displayValue(publishTime) });

      const numericFields = template.type === "competitor" ? nonNegativeCompetitorFields : nonNegativeSocialFields;
      numericFields.forEach((field) => {
        const value = record[field];
        if (value !== "" && !isInteger(value)) errors.push({ row: rowNumber, field, message: "必须填写非负整数", value: displayValue(value) });
      });
      if (template.type === "social" && record["涨粉量"] !== "" && !isInteger(record["涨粉量"], true)) errors.push({ row: rowNumber, field: "涨粉量", message: "必须填写整数，可为负数", value: displayValue(record["涨粉量"]) });
      if (template.type === "social" && record["内容类型"] !== "" && !contentTypeNames.includes(String(record["内容类型"]).trim() as never)) errors.push({ row: rowNumber, field: "内容类型", message: "内容类型必须为视频、图文、直播、文章或文字", value: displayValue(record["内容类型"]) });
      const url = String(record["作品链接"] ?? "").trim();
      if (template.type === "social" && url && !/^https?:\/\//i.test(url)) errors.push({ row: rowNumber, field: "作品链接", message: "作品链接必须以 http:// 或 https:// 开头", value: url });
    });

    const rowErrorNumbers = new Set(errors.filter((error) => error.row > 1).map((error) => error.row));
    const headerErrorCount = errors.filter((error) => error.row === 1).length;
    return Response.json({
      result: {
        valid: dataRows.length > 0 && errors.length === 0,
        fileName: file.name,
        templateKey,
        templateTitle: template.title,
        totalRows: dataRows.length,
        validRows: headerErrorCount ? 0 : Math.max(0, dataRows.length - rowErrorNumbers.size),
        errorRows: headerErrorCount ? dataRows.length : rowErrorNumbers.size,
        errors: errors.slice(0, 200),
        truncated: errors.length > 200,
        message: dataRows.length === 0 ? "模板中没有待校验的数据行" : errors.length ? "发现格式问题，请修正后重新校验" : "校验通过，可进入数据导入中心",
      },
    });
  } catch (error) {
    console.error("data template validation error", error);
    return Response.json({ error: "Excel 解析失败，请确认文件未损坏且格式正确" }, { status: 400 });
  }
}
