"use client";

export type FanReportExportData = {
  period: string;
  fansCount: number;
  newFans: number;
  lostFans: number;
  growthRate: number;
  trend: Array<{ record_date: string; new_fans: number; lost_fans: number; net_growth: number }>;
  growthSummary: string;
  profileSummary: string;
  growthReason: string;
  lossReason: string;
  easiestContent: string;
  bestPost: null | { title: string; fansGrowth: number; views: number };
  suggestions: string[];
  sourceNote: string;
};

const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 22) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function wrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4) {
  const characters = [...text];
  const lines: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current); current = character;
      if (lines.length === maxLines - 1) break;
    } else current = candidate;
  }
  const consumed = lines.join("").length;
  if (consumed < characters.length) {
    const remainder = characters.slice(consumed).join("");
    lines.push(remainder.length > 0 ? `${remainder.slice(0, Math.max(1, Math.floor(maxWidth / 28) - 1))}…` : "");
  } else if (current) lines.push(current);
  lines.slice(0, maxLines).forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return Math.min(lines.length, maxLines) * lineHeight;
}

function drawLine(context: CanvasRenderingContext2D, values: number[], x: number, y: number, width: number, height: number, color: string) {
  if (!values.length) return;
  const max = Math.max(...values, 1);
  context.beginPath();
  values.forEach((value, index) => {
    const pointX = x + (values.length === 1 ? width / 2 : index / (values.length - 1) * width);
    const pointY = y + height - value / max * height;
    if (index === 0) context.moveTo(pointX, pointY); else context.lineTo(pointX, pointY);
  });
  context.strokeStyle = color;
  context.lineWidth = 6;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

export async function downloadFanReportPng(report: FanReportExportData) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持PNG导出");

  context.fillStyle = "#f4f8f6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#123d33";
  context.fillRect(0, 0, canvas.width, 250);
  context.fillStyle = "#65e6b6";
  context.font = "700 28px system-ui, sans-serif";
  context.fillText("FAN OPERATIONS WEEKLY REPORT · V2.0", 90, 74);
  context.fillStyle = "#ffffff";
  context.font = "700 58px system-ui, sans-serif";
  context.fillText("抖音粉丝运营周报", 90, 148);
  context.fillStyle = "#cce9df";
  context.font = "400 25px system-ui, sans-serif";
  context.fillText(`${report.period} · 数据来自系统真实记录`, 90, 204);

  const metrics = [
    ["当前粉丝", compact.format(report.fansCount)], ["新增粉丝", `+${compact.format(report.newFans)}`],
    ["流失粉丝", compact.format(report.lostFans)], ["增长率", `${report.growthRate}%`],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 80 + index * 370;
    context.fillStyle = "#ffffff"; roundedRect(context, x, 290, 330, 170, 20);
    context.fillStyle = "#74847f"; context.font = "500 23px system-ui, sans-serif"; context.fillText(label, x + 30, 338);
    context.fillStyle = "#123d33"; context.font = "700 46px system-ui, sans-serif"; context.fillText(value, x + 30, 410);
  });

  context.fillStyle = "#ffffff"; roundedRect(context, 80, 500, 1440, 380, 24);
  context.fillStyle = "#123d33"; context.font = "700 32px system-ui, sans-serif"; context.fillText("粉丝增长趋势", 120, 558);
  context.fillStyle = "#71817c"; context.font = "400 20px system-ui, sans-serif"; context.fillText("新增粉丝 / 流失粉丝（每日）", 120, 594);
  const chartX = 150; const chartY = 640; const chartWidth = 1300; const chartHeight = 165;
  context.strokeStyle = "#dfe9e5"; context.lineWidth = 2;
  for (let index = 0; index < 4; index += 1) {
    const lineY = chartY + index * chartHeight / 3; context.beginPath(); context.moveTo(chartX, lineY); context.lineTo(chartX + chartWidth, lineY); context.stroke();
  }
  drawLine(context, report.trend.map((item) => item.new_fans), chartX, chartY, chartWidth, chartHeight, "#178f69");
  drawLine(context, report.trend.map((item) => item.lost_fans), chartX, chartY, chartWidth, chartHeight, "#e59047");
  context.fillStyle = "#178f69"; context.fillRect(1210, 548, 24, 6); context.fillStyle = "#52635d"; context.fillText("新增", 1245, 559);
  context.fillStyle = "#e59047"; context.fillRect(1340, 548, 24, 6); context.fillStyle = "#52635d"; context.fillText("流失", 1375, 559);

  const cards = [
    ["本周粉丝分析", report.growthSummary], ["画像变化", report.profileSummary],
    ["增长原因", report.growthReason], ["流失原因", report.lossReason],
  ];
  cards.forEach(([title, body], index) => {
    const x = index % 2 === 0 ? 80 : 810; const y = 920 + Math.floor(index / 2) * 260;
    context.fillStyle = "#ffffff"; roundedRect(context, x, y, 710, 225, 22);
    context.fillStyle = "#178f69"; context.font = "700 24px system-ui, sans-serif"; context.fillText(title, x + 32, y + 48);
    context.fillStyle = "#263b35"; context.font = "400 23px system-ui, sans-serif"; wrappedText(context, body, x + 32, y + 92, 646, 34, 4);
  });

  context.fillStyle = "#ffffff"; roundedRect(context, 80, 1460, 1440, 305, 24);
  context.fillStyle = "#123d33"; context.font = "700 32px system-ui, sans-serif"; context.fillText("下周运营建议", 120, 1518);
  context.fillStyle = "#263b35"; context.font = "400 23px system-ui, sans-serif";
  let suggestionY = 1570;
  report.suggestions.forEach((suggestion, index) => {
    context.fillStyle = "#dff5ec"; roundedRect(context, 120, suggestionY - 24, 48, 38, 10);
    context.fillStyle = "#178f69"; context.font = "700 19px system-ui, sans-serif"; context.fillText(String(index + 1).padStart(2, "0"), 130, suggestionY + 2);
    context.fillStyle = "#263b35"; context.font = "400 22px system-ui, sans-serif";
    const height = wrappedText(context, suggestion, 190, suggestionY, 1240, 32, 2); suggestionY += Math.max(62, height + 24);
  });

  context.fillStyle = "#768681"; context.font = "400 18px system-ui, sans-serif";
  context.fillText(report.sourceNote, 80, 1840);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG生成失败")), "image/png", 1));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.period.replaceAll("/", "-").replaceAll(" ", "_")}_抖音粉丝运营周报.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
